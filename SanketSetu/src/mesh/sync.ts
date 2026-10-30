/**
 * Anti-Entropy Synchronization Helpers (src/mesh/sync.ts)
 * Per §4:
 * - On new connection, nodes exchange `SYNC_INV` (compact list of message IDs they hold)
 *   and request only missing ones (`SYNC_REQ`).
 * - This delivers queued store-and-forward messages automatically when connectivity returns.
 */

import { MeshPacket, SyncInvCleartext, SyncReqCleartext } from './types';

const MAX_INV_IDS = 64;

/**
 * Builds a compact `SYNC_INV` payload listing up to 64 highest-priority packet IDs currently buffered.
 */
export function buildSyncInventory(bufferedPackets: MeshPacket[]): SyncInvCleartext {
  const sorted = [...bufferedPackets].sort(
    (a, b) => a.prio - b.prio || b.ts - a.ts
  );
  return {
    packetIds: sorted.slice(0, MAX_INV_IDS).map((p) => p.id),
  };
}

/**
 * Computes which packet IDs from a peer's `SYNC_INV` are missing locally.
 */
export function computeMissingPacketIds(
  remoteInventoryIds: string[],
  hasSeenOrBuffered: (id: string) => boolean
): SyncReqCleartext {
  const missingIds = remoteInventoryIds.filter((id) => !hasSeenOrBuffered(id));
  return {
    missingIds: missingIds.slice(0, MAX_INV_IDS),
  };
}
