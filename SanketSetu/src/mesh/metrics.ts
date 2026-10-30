/**
 * Real-Time Mesh Telemetry & Priority MetricLogger (src/mesh/metrics.ts)
 * Implements Priority 3 specification:
 * Records, per priority class (P0 SOS, P1 Emergency, P2 Normal, P3 Info/ACK):
 * - Latency (PENDING -> DELIVERED / SOS_ACK in ms)
 * - Jitter (standard deviation of latency in ms)
 * - Delivery ratio (delivered / sent)
 * - Hop counts (mean hops)
 * - Retry rate (retries / sent)
 * - Packets relayed, peer count over time, scan duty %, and structured drop reasons.
 */

import { PriorityLevel } from './types';

export type PacketDropReason =
  | 'replay_window'
  | 'seen_duplicate'
  | 'invalid_signature'
  | 'rate_limited'
  | 'ttl_expired'
  | 'saver_policy'
  | 'oversized';

export interface PriorityClassStats {
  priority: PriorityLevel;
  label: string;
  sentCount: number;
  deliveredCount: number;
  deliveryRatioPct: number;
  meanLatencyMs: number;
  jitterStdDevMs: number;
  lastLatencyMs: number | null;
  avgHops: number;
  retries: number;
  retryRate: number;
}

export interface PeerCountSample {
  ts: number;
  peerCount: number;
}

export interface CongestionBenchmarkSummary {
  ranAtTs: number;
  floodPacketsCount: number;
  sosLatencyMs: number;
  normalMeanLatencyMs: number;
  normalMaxLatencyMs: number;
  sosBypassSpeedupFactor: number;
}

export interface MeshQualitySnapshot {
  byPriority: Record<PriorityLevel, PriorityClassStats>;
  dropCounts: Record<PacketDropReason, number>;
  packetsRelayed: number;
  packetsSuppressedDuplicate: number;
  scanDutyCyclePct: number;
  peerSeries: PeerCountSample[];
  queueSizesByPriority: Record<PriorityLevel, number>;
  lastBenchmark: CongestionBenchmarkSummary | null;
}

interface InternalPriorityTracker {
  sentIds: Set<string>;
  deliveredIds: Set<string>;
  sendTimestamps: Map<string, number>;
  latenciesMs: number[];
  hopCounts: number[];
  retries: number;
}

export class MetricLogger {
  private readonly trackers: Record<PriorityLevel, InternalPriorityTracker> = {
    0: {
      sentIds: new Set(),
      deliveredIds: new Set(),
      sendTimestamps: new Map(),
      latenciesMs: [],
      hopCounts: [],
      retries: 0,
    },
    1: {
      sentIds: new Set(),
      deliveredIds: new Set(),
      sendTimestamps: new Map(),
      latenciesMs: [],
      hopCounts: [],
      retries: 0,
    },
    2: {
      sentIds: new Set(),
      deliveredIds: new Set(),
      sendTimestamps: new Map(),
      latenciesMs: [],
      hopCounts: [],
      retries: 0,
    },
    3: {
      sentIds: new Set(),
      deliveredIds: new Set(),
      sendTimestamps: new Map(),
      latenciesMs: [],
      hopCounts: [],
      retries: 0,
    },
  };

  private readonly dropCounts: Record<PacketDropReason, number> = {
    replay_window: 0,
    seen_duplicate: 0,
    invalid_signature: 0,
    rate_limited: 0,
    ttl_expired: 0,
    saver_policy: 0,
    oversized: 0,
  };

  private readonly peerSeries: PeerCountSample[] = [];
  private lastBenchmark: CongestionBenchmarkSummary | null = null;

  public recordPacketSent(
    packetId: string,
    prio: PriorityLevel,
    now = Date.now()
  ): void {
    const t = this.trackers[prio];
    t.sentIds.add(packetId);
    if (!t.sendTimestamps.has(packetId)) {
      t.sendTimestamps.set(packetId, now);
    }
  }

  public recordPacketRetry(prio: PriorityLevel): void {
    this.trackers[prio].retries += 1;
  }

  public recordPacketDelivered(
    packetId: string,
    prio: PriorityLevel,
    hops: number,
    now = Date.now()
  ): number | null {
    const t = this.trackers[prio];
    if (t.deliveredIds.has(packetId)) {
      return null;
    }
    t.deliveredIds.add(packetId);
    t.hopCounts.push(Math.max(1, hops));

    const sentAt = t.sendTimestamps.get(packetId);
    if (sentAt !== undefined) {
      const latency = Math.max(1, now - sentAt);
      t.latenciesMs.push(latency);
      return latency;
    }
    return null;
  }

  public recordDrop(reason: PacketDropReason): void {
    this.dropCounts[reason] += 1;
  }

  public recordPeerCount(peerCount: number, now = Date.now()): void {
    const last = this.peerSeries[this.peerSeries.length - 1];
    if (!last || last.peerCount !== peerCount || now - last.ts > 5000) {
      this.peerSeries.push({ ts: now, peerCount });
      if (this.peerSeries.length > 24) {
        this.peerSeries.shift();
      }
    }
  }

  public setBenchmarkSummary(summary: CongestionBenchmarkSummary): void {
    this.lastBenchmark = summary;
  }

  public getSnapshot(extra?: {
    packetsRelayed?: number;
    packetsSuppressedDuplicate?: number;
    scanDutyCyclePct?: number;
    queueSizesByPriority?: Record<PriorityLevel, number>;
  }): MeshQualitySnapshot {
    const labels: Record<PriorityLevel, string> = {
      0: 'P0 · SOS Beacon',
      1: 'P1 · Emergency / Safe / Hazard',
      2: 'P2 · Normal Direct Msg',
      3: 'P3 · Receipts / Control',
    };

    const byPriority = {} as Record<PriorityLevel, PriorityClassStats>;
    for (const p of [0, 1, 2, 3] as const) {
      const t = this.trackers[p];
      const sentCount = t.sentIds.size;
      const deliveredCount = t.deliveredIds.size;
      const deliveryRatioPct =
        sentCount > 0 ? Math.min(100, Math.round((deliveredCount / sentCount) * 100)) : 100;

      let meanLatencyMs = 0;
      let jitterStdDevMs = 0;
      let lastLatencyMs: number | null = null;

      if (t.latenciesMs.length > 0) {
        lastLatencyMs = t.latenciesMs[t.latenciesMs.length - 1];
        const sum = t.latenciesMs.reduce((acc, v) => acc + v, 0);
        meanLatencyMs = Math.round(sum / t.latenciesMs.length);

        if (t.latenciesMs.length >= 2) {
          const mean = sum / t.latenciesMs.length;
          const variance =
            t.latenciesMs.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
            t.latenciesMs.length;
          jitterStdDevMs = Math.round(Math.sqrt(variance));
        } else {
          jitterStdDevMs = 0;
        }
      }

      const avgHops =
        t.hopCounts.length > 0
          ? Number(
              (
                t.hopCounts.reduce((acc, v) => acc + v, 0) / t.hopCounts.length
              ).toFixed(1)
            )
          : 0;

      const retryRate =
        sentCount > 0 ? Number((t.retries / sentCount).toFixed(2)) : 0;

      byPriority[p] = {
        priority: p,
        label: labels[p],
        sentCount,
        deliveredCount,
        deliveryRatioPct,
        meanLatencyMs,
        jitterStdDevMs,
        lastLatencyMs,
        avgHops,
        retries: t.retries,
        retryRate,
      };
    }

    return {
      byPriority,
      dropCounts: { ...this.dropCounts },
      packetsRelayed: extra?.packetsRelayed ?? 0,
      packetsSuppressedDuplicate: extra?.packetsSuppressedDuplicate ?? 0,
      scanDutyCyclePct: extra?.scanDutyCyclePct ?? 100,
      peerSeries: [...this.peerSeries],
      queueSizesByPriority: extra?.queueSizesByPriority ?? {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
      lastBenchmark: this.lastBenchmark,
    };
  }

  public clear(): void {
    for (const p of [0, 1, 2, 3] as const) {
      this.trackers[p].sentIds.clear();
      this.trackers[p].deliveredIds.clear();
      this.trackers[p].sendTimestamps.clear();
      this.trackers[p].latenciesMs = [];
      this.trackers[p].hopCounts = [];
      this.trackers[p].retries = 0;
    }
    for (const k of Object.keys(this.dropCounts) as PacketDropReason[]) {
      this.dropCounts[k] = 0;
    }
    this.peerSeries.length = 0;
    this.lastBenchmark = null;
  }
}
