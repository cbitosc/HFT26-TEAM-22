/**
 * Persistent Store-and-Forward Outbox (src/mesh/outbox.ts)
 * - Exponential backoff from 1 s (`RETRY_BASE_MS = 1000`) up to a cap of 30 s (`RETRY_CAP_MS = 30_000`),
 *   then relies on `SYNC_INV` / `SYNC_REQ` anti-entropy reconciliation.
 * - Also retried immediately on every `peerFound` / `HELLO` event.
 * - SOS (Priority 0) packets remain queued and re-sent until a responder `SOS_ACK` is received.
 */

import { MESH_CONSTANTS } from './constants';
import { MeshPacket, OutboxEntry } from './types';

export class StoreAndForwardOutbox {
  private readonly entries = new Map<string, OutboxEntry>();
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryCapMs: number;
  private readonly defaultMaxWindowMs: number;
  private totalRetries = 0;

  constructor(
    baseRetryDelayMs = MESH_CONSTANTS.RETRY_BASE_MS,
    defaultMaxWindowMs = MESH_CONSTANTS.OUTBOX_MAX_WINDOW_MS,
    maxRetryCapMs = MESH_CONSTANTS.RETRY_CAP_MS
  ) {
    this.baseRetryDelayMs = baseRetryDelayMs;
    this.defaultMaxWindowMs = defaultMaxWindowMs;
    this.maxRetryCapMs = maxRetryCapMs;
  }

  public upsert(
    packet: MeshPacket,
    now = Date.now(),
    maxWindowMs = this.defaultMaxWindowMs
  ): OutboxEntry {
    const existing = this.entries.get(packet.id);
    if (existing) {
      return existing;
    }

    const entry: OutboxEntry = {
      packet,
      createdAt: now,
      lastAttemptAt: now,
      attempts: 0,
      nextRetryAt: now + this.baseRetryDelayMs,
      maxWindowMs,
      acknowledgedBy: [],
    };
    this.entries.set(packet.id, entry);
    return entry;
  }

  /**
   * Marks a packet as acknowledged by a node.
   * For direct messages (`dst !== 'BROADCAST'`), removes from active retry once the recipient ACKs.
   * For SOS broadcasts (`packet.type === 'SOS'`), removes once a responder `SOS_ACK` arrives (`isFinalRecipientAck === true`).
   */
  public markAcknowledged(
    packetId: string,
    responderNodeId: string,
    isFinalRecipientAck: boolean
  ): boolean {
    const entry = this.entries.get(packetId);
    if (!entry) return false;

    if (!entry.acknowledgedBy.includes(responderNodeId)) {
      entry.acknowledgedBy.push(responderNodeId);
    }

    if (isFinalRecipientAck) {
      this.entries.delete(packetId);
      return true;
    }
    return true;
  }

  /** Re-inserts a persisted entry after an app restart; it becomes due for retry immediately. */
  public restore(entry: OutboxEntry, now = Date.now()): void {
    if (this.entries.has(entry.packet.id)) return;
    this.entries.set(entry.packet.id, { ...entry, nextRetryAt: now });
  }

  public remove(packetId: string): void {
    this.entries.delete(packetId);
  }

  public get(packetId: string): OutboxEntry | undefined {
    return this.entries.get(packetId);
  }

  /**
   * Computes exponential backoff (`1s -> 2s -> 4s -> 8s -> 16s -> 30s cap`).
   */
  public computeBackoffMs(attempts: number): number {
    return Math.min(
      this.maxRetryCapMs,
      this.baseRetryDelayMs * Math.pow(2, Math.max(0, attempts - 1))
    );
  }

  public getDueForRetry(now = Date.now()): MeshPacket[] {
    const due: MeshPacket[] = [];
    for (const [id, entry] of this.entries.entries()) {
      // Never expire an unacknowledged SOS packet during an active incident
      if (
        entry.packet.type !== 'SOS' &&
        now - entry.createdAt > entry.maxWindowMs
      ) {
        this.entries.delete(id);
        continue;
      }
      if (now >= entry.nextRetryAt) {
        entry.attempts += 1;
        this.totalRetries += 1;
        entry.lastAttemptAt = now;
        const backoff = this.computeBackoffMs(entry.attempts);
        entry.nextRetryAt = now + backoff;
        due.push(entry.packet);
      }
    }
    // Strictly sort by priority (0 SOS first)
    return due.sort((a, b) => a.prio - b.prio);
  }

  /**
   * Returns all unexpired buffered packets for immediate retry on `peerFound`.
   */
  public getAllBufferedPackets(now = Date.now()): MeshPacket[] {
    const list: MeshPacket[] = [];
    for (const [id, entry] of this.entries.entries()) {
      if (
        entry.packet.type !== 'SOS' &&
        now - entry.createdAt > entry.maxWindowMs
      ) {
        this.entries.delete(id);
        continue;
      }
      list.push(entry.packet);
    }
    return list.sort((a, b) => a.prio - b.prio);
  }

  public recordPeerFoundRetry(packetId: string, now = Date.now()): void {
    const entry = this.entries.get(packetId);
    if (entry) {
      entry.attempts += 1;
      this.totalRetries += 1;
      entry.lastAttemptAt = now;
      entry.nextRetryAt = now + this.computeBackoffMs(entry.attempts);
    }
  }

  public getTotalRetries(): number {
    return this.totalRetries;
  }

  public getAllEntries(): OutboxEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => a.packet.prio - b.packet.prio || b.createdAt - a.createdAt
    );
  }

  public size(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
    this.totalRetries = 0;
  }
}
