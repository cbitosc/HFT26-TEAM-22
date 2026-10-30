/**
 * Strict Mesh Protocol, Cryptography, and Transport Type Definitions (src/mesh/types.ts)
 * Zero `any` allowed. Implements §3, §4, §5, §6, §8, and §9 of the Sanket Setu specification.
 */

import { ResponderCertificate } from '../crypto/responderCert';
import { SealedLocationEnvelope } from '../crypto/sealedLocation';

export type PacketType =
  | 'HELLO'
  | 'MSG'
  | 'SOS'
  | 'SOS_ACK'
  | 'SAFE'
  | 'HAZARD'
  | 'ACK'
  | 'SYNC_INV'
  | 'SYNC_REQ';

/**
 * Priority levels:
 * 0 = SOS / SOS_ACK (highest, never dropped)
 * 1 = Emergency (SAFE, HAZARD, Urgent MSG)
 * 2 = Normal (Direct MSG)
 * 3 = Receipts / Info / Control
 */
export type PriorityLevel = 0 | 1 | 2 | 3;

export type MessageDeliveryState =
  | 'PENDING'
  | 'SENT'
  | 'RELAYED'
  | 'DELIVERED';

export type PowerMode = 'active' | 'balanced' | 'saver';

export type LocationPrecision = 'disabled' | 'coarse' | 'precise';

export type SOSCategoryId =
  | 'medical'
  | 'trapped'
  | 'fire'
  | 'flood'
  | 'supplies'
  | 'safe'
  | 'other';

export type HazardCategoryId =
  | 'flood'
  | 'collapse'
  | 'fire'
  | 'blocked_road';

export type HazardCategory = HazardCategoryId;

export type TrustStatus = 'verified' | 'unverified' | 'key_changed';

/**
 * Wire Packet Format (§4):
 * ≤ 4 KB compact JSON/binary envelope, message text ≤ 500 chars.
 */
export interface MeshPacket {
  v: 1;
  /** 16-byte random hex ID (32 hex chars) */
  id: string;
  type: PacketType;
  prio: PriorityLevel;
  /** Default 8 for MSG, 10 for SAFE/HAZARD, 12 for SOS/SOS_ACK */
  ttl: number;
  /** Incremented at each relay hop */
  hops: number;
  /** Sender short fingerprint (8 hex chars) */
  src: string;
  /** Sender Ed25519 signing public key (base64) */
  srcSignPub: string;
  /** Sender X25519 encryption public key (base64) */
  srcBoxPub: string;
  /** Recipient short fingerprint or 'BROADCAST' */
  dst: string;
  /** Unix timestamp ms */
  ts: number;
  /** 24-byte cryptographic nonce (base64) */
  nonce: string;
  /** Base64 ciphertext (or signed control JSON for HELLO/ACK/SYNC) */
  payload: string;
  /** Ordered array of truncated node IDs that relayed this packet */
  route: string[];
  /** Ed25519 detached signature over canonical packet fields (base64) */
  sig: string;
}

export interface HelloCleartext {
  displayName: string;
  signPub: string;
  boxPub: string;
  batteryPct: number;
  powerMode: PowerMode;
  /** Wire protocol version the sender speaks (1). Older HELLOs omit it. */
  protocolVersion?: number;
  responderCert?: ResponderCertificate;
}

export interface DirectMessageCleartext {
  text: string;
  senderName: string;
  replyToId?: string;
}

export interface SOSCleartext {
  category: SOSCategoryId;
  text: string;
  senderName: string;
  headcount: number;
  locationPrecision: LocationPrecision;
  /** Coarse (~1km rounded) coordinates visible to general mesh peers when location is enabled */
  lat?: number;
  lng?: number;
  /** Exact coordinates sealed to the Responder Group X25519 public key (§5 & §9.2) */
  sealedPreciseLocation?: SealedLocationEnvelope;
  pictogramId?: string;
  isLastGasp?: boolean;
}

export interface SosAckCleartext {
  targetAlertId: string;
  responderName: string;
  status: 'ACKNOWLEDGED' | 'RESPONDING';
  note?: string;
  recordedRoute: string[];
  responderCert?: ResponderCertificate;
}

export interface SafeCleartext {
  circleId: string;
  circleName: string;
  senderName: string;
  status: 'SAFE' | 'NEEDS_ASSISTANCE';
  note: string;
  locationLabel?: string;
  batteryPct: number;
}

export interface HazardCleartext {
  category: HazardCategory;
  title: string;
  description: string;
  senderName: string;
  lat: number;
  lng: number;
  expiresAt: number;
}

export interface AckCleartext {
  targetPacketId: string;
  ackKind: 'DELIVERED' | 'RELAY_RECEIPT' | 'SOS_RESPONDING';
  responderName: string;
  recordedRoute: string[];
  responderCert?: ResponderCertificate;
  note?: string;
}

export interface SyncInvCleartext {
  packetIds: string[];
}

export interface SyncReqCleartext {
  missingIds: string[];
}

export interface PeerNode {
  nodeId: string;
  displayName: string;
  signPub: string;
  boxPub: string;
  lastSeenTs: number;
  rssi: number;
  linkQuality: number; // 0..100
  hopsAway: number;
  isDirectNeighbor: boolean;
  trustStatus: TrustStatus;
  isVerifiedResponder?: boolean;
  responderRole?: string;
  batteryPct?: number;
  powerMode?: PowerMode;
  invalidSigCount: number;
  rateLimitTokens: number;
  lastRateTickTs: number;
}

export interface OutboxEntry {
  packet: MeshPacket;
  createdAt: number;
  lastAttemptAt: number;
  attempts: number;
  nextRetryAt: number;
  maxWindowMs: number;
  acknowledgedBy: string[];
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  direction: 'outbound' | 'inbound';
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
  priority: PriorityLevel;
  timestamp: number;
  deliveryState: MessageDeliveryState;
  relayedHops: number;
  route: string[];
  reachedNodes: string[];
  packet: MeshPacket;
  signatureValid: boolean;
  cipherSuite: 'X25519-XSalsa20-Poly1305' | 'Channel-XSalsa20-Poly1305';
  packetHashHex: string;
}

export interface ResponderAckRecord {
  ackPacketId: string;
  responderId: string;
  responderName: string;
  status: 'ACKNOWLEDGED' | 'RESPONDING';
  timestamp: number;
  hops: number;
  route: string[];
  verifiedCert: boolean;
  certRole?: string;
  certOrg?: string;
  note?: string;
}

export interface StoredSOSAlert {
  id: string;
  senderId: string;
  senderName: string;
  category: SOSCategoryId;
  text: string;
  headcount: number;
  priority: PriorityLevel;
  timestamp: number;
  hops: number;
  route: string[];
  locationPrecision: LocationPrecision;
  /** Coarse coordinates (~1km) visible to all peers */
  lat?: number;
  lng?: number;
  /** Sealed precise location envelope */
  sealedPreciseLocation?: SealedLocationEnvelope;
  /** Unsealed exact coordinates (populated ONLY if local node holds a verified ResponderCertificate) */
  unsealedPreciseLocation?: {
    lat: number;
    lng: number;
    accuracyMeters: number;
  } | null;
  pictogramId?: string;
  isLastGasp?: boolean;
  acknowledgedByMe: boolean;
  respondingByMe: boolean;
  reachedNodeIds: string[];
  responderAcks: ResponderAckRecord[];
  bridgedOnline?: boolean;
  packet: MeshPacket;
  signatureValid: boolean;
  offlineUrgencyHint?: {
    level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    matchedKeywords: string[];
    reason: string;
  };
}

export interface StoredHazardReport {
  id: string;
  senderId: string;
  senderName: string;
  category: HazardCategory;
  title: string;
  description: string;
  lat: number;
  lng: number;
  timestamp: number;
  expiresAt: number;
  hops: number;
  route: string[];
  signatureValid: boolean;
  packet: MeshPacket;
}

export interface SafetyCircleMemberState {
  nodeId: string;
  displayName: string;
  status: 'SAFE' | 'NEEDS_ASSISTANCE' | 'UNKNOWN';
  lastCheckInTs?: number;
  note?: string;
  hops: number;
  batteryPct?: number;
}

export interface SafetyCircle {
  circleId: string;
  circleName: string;
  circleKeyHint: string;
  createdAt: number;
  members: SafetyCircleMemberState[];
}

export interface MeshActivityMetrics {
  powerMode: PowerMode;
  batteryPct: number;
  isCharging: boolean;
  scanDutyCyclePct: number;
  scanWindowMs: number;
  sleepWindowMs: number;
  packetsSent: number;
  packetsReceived: number;
  packetsRelayed: number;
  packetsDroppedInvalidSig: number;
  packetsSuppressedDuplicate: number;
  syncInventoriesExchanged: number;
}
