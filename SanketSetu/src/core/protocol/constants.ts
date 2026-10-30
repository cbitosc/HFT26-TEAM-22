/**
 * Centralized Sanket Setu Mesh Protocol Constants (src/mesh/constants.ts)
 * Single source of truth for TTLs, jitter windows, overhear suppression,
 * replay window, backoff parameters, rate limits, and connection caps.
 */

export const MESH_CONSTANTS = {
  /** Maximum wire packet size in bytes (≤ 4 KB) */
  MAX_PACKET_BYTES: 4096,
  /** Maximum message text length in characters */
  MAX_TEXT_CHARS: 500,

  /** Default hop TTL for normal packets (MSG, ACK, SAFE, HAZARD) */
  TTL_NORMAL: 8,
  /** Default hop TTL for Priority-0 SOS & SOS_ACK packets */
  TTL_SOS: 12,
  /** Default hop TTL for link-local control packets (HELLO, SYNC_INV, SYNC_REQ) */
  TTL_CONTROL: 2,

  /** Random relay forwarding jitter for Priority-0 SOS packets (0–10 ms) */
  JITTER_SOS_MIN_MS: 0,
  JITTER_SOS_MAX_MS: 10,

  /** Random relay forwarding jitter for Normal/Emergency packets (10–50 ms) */
  JITTER_NORMAL_MIN_MS: 10,
  JITTER_NORMAL_MAX_MS: 50,

  /** Counter-based broadcast suppression threshold: cancel forward if heard from ≥ 2 neighbors */
  OVERHEAR_SUPPRESSION_THRESHOLD: 2,

  /** Seen-cache deduplication retention window (~1 hour) */
  SEEN_CACHE_TTL_MS: 60 * 60 * 1000,
  SEEN_CACHE_MAX_ENTRIES: 4096,

  /** Replay protection timestamp window (±5 minutes) */
  REPLAY_WINDOW_MS: 5 * 60 * 1000,

  /** Store-and-forward outbox exponential backoff: 1 s base up to ~30 s cap */
  RETRY_BASE_MS: 1000,
  RETRY_CAP_MS: 30_000,
  OUTBOX_MAX_WINDOW_MS: 60 * 60 * 1000,

  /** Per-peer rate limiting & signature reputation */
  MAX_INVALID_SIGS_BEFORE_BAN: 3,
  RATE_LIMIT_CAPACITY: 40,
  RATE_LIMIT_REFILL_PER_SEC: 8,

  /** Google Nearby Connections Strategy.P2P_CLUSTER practical concurrent connection cap (3–5 peers) */
  MAX_CONCURRENT_CONNECTIONS: 4,
  IDLE_CONNECTION_ROTATE_MS: 45_000,
} as const;
