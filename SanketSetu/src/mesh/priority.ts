/**
 * Four-Queue Priority Scheduler & Congestion / Battery Filter (src/mesh/priority.ts)
 * Implements Priority 1 specification:
 * - Four explicit queues:
 *   Queue 0: SOS (Priority 0 — bypasses congestion limits, never dropped)
 *   Queue 1: Emergency (Priority 1 — SOS_ACK, SAFE, HAZARD, urgent messages; never dropped)
 *   Queue 2: Normal (Priority 2 — standard direct messages; deferred/dropped after P3 under congestion)
 *   Queue 3: Info / ACK / Receipts (Priority 3 — dropped/deferred first under congestion or low battery)
 * - Dequeues strictly in priority order: P0 -> P1 -> P2 -> P3.
 */

import { MeshPacket, PowerMode, PriorityLevel } from './types';

export interface QueuedOutboundItem {
  packet: MeshPacket;
  targetPeerId: string | 'ALL_EXCEPT_SENDER';
  excludePeerId?: string;
  enqueuedAt: number;
}

export class MeshPriorityQueue {
  private readonly queues: Record<PriorityLevel, QueuedOutboundItem[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
  };
  private readonly maxCapacity: number;
  private droppedP3Count = 0;
  private droppedP2Count = 0;

  constructor(maxCapacity = 64) {
    this.maxCapacity = maxCapacity;
  }

  public isControlPacket(packet: MeshPacket): boolean {
    return (
      packet.type === 'HELLO' ||
      packet.type === 'ACK' ||
      packet.type === 'SYNC_INV' ||
      packet.type === 'SYNC_REQ'
    );
  }

  /**
   * Determines whether a transit relay packet is permitted under current battery level & power mode.
   * Below 15% battery or in Saver mode, only P0 (SOS) and P1 (Emergency) are relayed; P3 and P2 are dropped/deferred.
   */
  public canRelayUnderPowerPolicy(
    packet: MeshPacket,
    powerMode: PowerMode,
    batteryPct: number
  ): boolean {
    if (
      packet.prio === 0 ||
      packet.type === 'SOS' ||
      packet.type === 'SOS_ACK' ||
      packet.prio === 1
    ) {
      return true; // Never drop P0 or P1
    }
    if (this.isControlPacket(packet)) {
      return true;
    }
    if (batteryPct < 15 || powerMode === 'saver') {
      return false; // Drop P2 and P3 transit relays in Saver mode
    }
    return true;
  }

  /**
   * Enqueues an outbound packet into its dedicated priority queue (0, 1, 2, or 3).
   * - P0 (SOS) and P1 (Emergency) are NEVER dropped. If total capacity is reached,
   *   evicts from Queue 3 first, then Queue 2.
   */
  public enqueue(item: QueuedOutboundItem): boolean {
    const effectivePrio: PriorityLevel =
      item.packet.type === 'SOS' || item.packet.type === 'SOS_ACK'
        ? 0
        : item.packet.prio;

    if (this.size() >= this.maxCapacity) {
      // Evict from P3 first, then P2
      if (this.queues[3].length > 0) {
        if (effectivePrio < 3) {
          this.queues[3].pop();
          this.droppedP3Count += 1;
        } else {
          this.droppedP3Count += 1;
          return false;
        }
      } else if (this.queues[2].length > 0) {
        if (effectivePrio < 2) {
          this.queues[2].pop();
          this.droppedP2Count += 1;
        } else {
          this.droppedP2Count += 1;
          return false;
        }
      } else if (effectivePrio >= 2) {
        // Queue is full of P0/P1 traffic; drop incoming P2/P3
        if (effectivePrio === 3) this.droppedP3Count += 1;
        else this.droppedP2Count += 1;
        return false;
      }
      // Note: if effectivePrio is 0 or 1, it is NEVER dropped even if capacity is exceeded!
    }

    this.queues[effectivePrio].push(item);
    return true;
  }

  /**
   * Dequeues strictly by priority: Queue 0 -> Queue 1 -> Queue 2 -> Queue 3 (FIFO within each level).
   */
  public dequeue(): QueuedOutboundItem | undefined {
    for (const p of [0, 1, 2, 3] as const) {
      if (this.queues[p].length > 0) {
        return this.queues[p].shift();
      }
    }
    return undefined;
  }

  public drainBatch(maxBatchSize = 16): QueuedOutboundItem[] {
    const out: QueuedOutboundItem[] = [];
    while (out.length < maxBatchSize) {
      const next = this.dequeue();
      if (!next) break;
      out.push(next);
    }
    return out;
  }

  public size(): number {
    return (
      this.queues[0].length +
      this.queues[1].length +
      this.queues[2].length +
      this.queues[3].length
    );
  }

  public sizeByPriority(): Record<PriorityLevel, number> {
    return {
      0: this.queues[0].length,
      1: this.queues[1].length,
      2: this.queues[2].length,
      3: this.queues[3].length,
    };
  }

  public getCongestionDrops(): { droppedP2: number; droppedP3: number } {
    return {
      droppedP2: this.droppedP2Count,
      droppedP3: this.droppedP3Count,
    };
  }

  public peekAll(): readonly QueuedOutboundItem[] {
    return [
      ...this.queues[0],
      ...this.queues[1],
      ...this.queues[2],
      ...this.queues[3],
    ];
  }

  public clear(): void {
    this.queues[0] = [];
    this.queues[1] = [];
    this.queues[2] = [];
    this.queues[3] = [];
  }
}
