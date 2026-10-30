/**
 * Dexie IndexedDB Offline Storage Schema (src/db/dexie.ts)
 * Persists messages, alerts, outbox packets, seen-cache IDs (~1h expiry), peers/contacts,
 * and encrypted identity in IndexedDB so the app works 100% offline across reloads.
 */

import Dexie, { Table } from 'dexie';
import {
  OutboxEntry,
  PeerNode,
  StoredMessage,
  StoredSOSAlert,
} from '../mesh/types';
import { PersistedSeenRow } from '../mesh/seenCache';
import { generateVaultKeyB64 } from '../crypto/identity';

export interface KeyValueRow {
  key: string;
  value: string;
  updatedAt: number;
}

export class SanketDatabase extends Dexie {
  public messages!: Table<StoredMessage, string>;
  public alerts!: Table<StoredSOSAlert, string>;
  public outbox!: Table<OutboxEntry, string>;
  public peers!: Table<PeerNode, string>;
  public seen!: Table<PersistedSeenRow, string>;
  public kv!: Table<KeyValueRow, string>;

  constructor() {
    super('SanketMeshDB_v2');
    this.version(1).stores({
      messages: 'id, conversationId, timestamp, priority, deliveryState',
      alerts: 'id, priority, timestamp, category',
      outbox: 'packet.id, createdAt, nextRetryAt',
      peers: 'nodeId, trustStatus, lastSeenTs',
      seen: 'packetId, expiresAt',
      kv: 'key',
    });
    // v2: index senderId so a restart can restore this node's own messages/alerts.
    this.version(2).stores({
      messages: 'id, conversationId, timestamp, priority, deliveryState, senderId',
      alerts: 'id, priority, timestamp, category, senderId',
    });
  }
}

export const sanketDb = new SanketDatabase();

export async function persistSeenEntry(row: PersistedSeenRow): Promise<void> {
  try {
    await sanketDb.seen.put(row);
  } catch {
    // Ignore when running in Node.js unit tests without IndexedDB
  }
}

export async function loadUnexpiredSeenEntries(
  now = Date.now()
): Promise<PersistedSeenRow[]> {
  try {
    await sanketDb.seen.where('expiresAt').belowOrEqual(now).delete();
    return await sanketDb.seen.toArray();
  } catch {
    return [];
  }
}

export async function saveKvJson<T>(key: string, value: T): Promise<void> {
  try {
    await sanketDb.kv.put({
      key,
      value: JSON.stringify(value),
      updatedAt: Date.now(),
    });
  } catch {
    // Fallback to localStorage if IndexedDB is restricted in private iframe
    try {
      localStorage.setItem(`sanket_kv_${key}`, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
}

/**
 * Returns this device's local identity vault key, generating and persisting one on first use.
 * See `crypto/identity.ts` for what this key protects (and what it does not).
 */
export async function getOrCreateLocalVaultKey(): Promise<string> {
  const existing = await loadKvJson<string>('local_vault_key_b64');
  if (existing) return existing;
  const fresh = generateVaultKeyB64();
  await saveKvJson('local_vault_key_b64', fresh);
  return fresh;
}

export async function loadKvJson<T>(key: string): Promise<T | null> {
  try {
    const row = await sanketDb.kv.get(key);
    if (row) {
      return JSON.parse(row.value) as T;
    }
  } catch {
    // Fallback to localStorage
  }
  try {
    const raw = localStorage.getItem(`sanket_kv_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
