/**
 * Seen-Cache Deduplication & Overhear Suppression (src/mesh/seenCache.ts)
 * - Default expiry: 1 hour (`MESH_CONSTANTS.SEEN_CACHE_TTL_MS`).
 * - Persists and hydrates seen packet IDs in Dexie IndexedDB (`seen` table) when running in browser.
 * - Tracks distinct neighbors overheard forwarding each packet ID so scheduled relays can be
 *   cancelled if heard from ≥ 2 neighbors during the jitter window.
 */

import { MESH_CONSTANTS } from './constants';

export interface PersistedSeenRow {
  packetId: string;
  firstSeenAt: number;
  expiresAt: number;
  forwarded: boolean;
}

interface SeenRecord {
  packetId: string;
  firstSeenAt: number;
  expiresAt: number;
  overheardNeighbors: Set<string>;
  processed: boolean;
  forwarded: boolean;
}

export class SeenCache {
  private readonly records = new Map<string, SeenRecord>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private persistCallback?: (row: PersistedSeenRow) => void;

  constructor(
    defaultTtlMs = MESH_CONSTANTS.SEEN_CACHE_TTL_MS,
    maxEntries = MESH_CONSTANTS.SEEN_CACHE_MAX_ENTRIES,
    persistCallback?: (row: PersistedSeenRow) => void
  ) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.persistCallback = persistCallback;
  }

  public setPersistCallback(cb: (row: PersistedSeenRow) => void): void {
    this.persistCallback = cb;
  }

  public hydrateFromStorage(
    rows: PersistedSeenRow[],
    now = Date.now()
  ): void {
    for (const r of rows) {
      if (r.expiresAt > now) {
        this.records.set(r.packetId, {
          packetId: r.packetId,
          firstSeenAt: r.firstSeenAt,
          expiresAt: r.expiresAt,
          overheardNeighbors: new Set<string>(),
          processed: true,
          forwarded: r.forwarded,
        });
      }
    }
  }

  public prune(now = Date.now()): void {
    for (const [id, rec] of this.records.entries()) {
      if (rec.expiresAt <= now) {
        this.records.delete(id);
      }
    }
    if (this.records.size > this.maxEntries) {
      const sorted = Array.from(this.records.values()).sort(
        (a, b) => a.firstSeenAt - b.firstSeenAt
      );
      const toRemove = sorted.length - this.maxEntries;
      for (let i = 0; i < toRemove; i++) {
        this.records.delete(sorted[i].packetId);
      }
    }
  }

  public hasSeen(packetId: string, now = Date.now()): boolean {
    const rec = this.records.get(packetId);
    if (!rec) return false;
    if (rec.expiresAt <= now) {
      this.records.delete(packetId);
      return false;
    }
    return rec.processed;
  }

  /**
   * Marks a packet ID as seen/processed and records the neighbor it arrived from.
   * Returns `true` if this is the FIRST time processing it, or `false` if duplicate.
   */
  public markSeenAndRecordNeighbor(
    packetId: string,
    fromNeighborId?: string,
    now = Date.now()
  ): boolean {
    this.prune(now);
    const existing = this.records.get(packetId);
    if (existing && existing.expiresAt > now) {
      if (fromNeighborId) {
        existing.overheardNeighbors.add(fromNeighborId);
      }
      if (existing.processed) {
        return false;
      }
      existing.processed = true;
      return true;
    }

    const neighbors = new Set<string>();
    if (fromNeighborId) {
      neighbors.add(fromNeighborId);
    }

    const expiresAt = now + this.defaultTtlMs;
    this.records.set(packetId, {
      packetId,
      firstSeenAt: now,
      expiresAt,
      overheardNeighbors: neighbors,
      processed: true,
      forwarded: false,
    });

    this.persistCallback?.({
      packetId,
      firstSeenAt: now,
      expiresAt,
      forwarded: false,
    });

    return true;
  }

  public getOverheardCount(packetId: string, now = Date.now()): number {
    const rec = this.records.get(packetId);
    if (!rec || rec.expiresAt <= now) return 0;
    return rec.overheardNeighbors.size;
  }

  /**
   * Counter-based broadcast storm suppression:
   * Suppresses forwarding if ≥ `threshold` (default 2) distinct neighbors already forwarded this packet ID,
   * or if this node has already forwarded it.
   */
  public shouldSuppressForward(
    packetId: string,
    threshold = MESH_CONSTANTS.OVERHEAR_SUPPRESSION_THRESHOLD,
    now = Date.now()
  ): boolean {
    const rec = this.records.get(packetId);
    if (!rec || rec.expiresAt <= now) return false;
    if (rec.forwarded) return true;
    return rec.overheardNeighbors.size >= threshold;
  }

  public markForwarded(packetId: string, now = Date.now()): void {
    const rec = this.records.get(packetId);
    if (rec && rec.expiresAt > now) {
      rec.forwarded = true;
      this.persistCallback?.({
        packetId: rec.packetId,
        firstSeenAt: rec.firstSeenAt,
        expiresAt: rec.expiresAt,
        forwarded: true,
      });
    }
  }

  public getAllUnexpiredIds(now = Date.now()): string[] {
    this.prune(now);
    return Array.from(this.records.keys());
  }

  public size(): number {
    return this.records.size;
  }

  public clear(): void {
    this.records.clear();
  }
}
