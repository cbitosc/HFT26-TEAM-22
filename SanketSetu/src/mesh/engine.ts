/**
 * Core Sanket Setu Mesh Engine (src/mesh/engine.ts)
 * Transport-agnostic implementation of §4, §5, §6, §9:
 * - Ed25519 signature authentication on every packet (HELLO, MSG, SOS, SOS_ACK, SAFE, HAZARD, ACK, SYNC_INV, SYNC_REQ).
 * - X25519 ECDH end-to-end encryption for Direct Messages (`MSG`).
 * - Shared Emergency Channel authenticated encryption (`nacl.secretbox`) for `SOS` broadcasts,
 *   PLUS Responder-Key Sealed Precise Location (`nacl.box` to Responder Group X25519 key).
 * - Verified Responder Certificates (`DEMO AUTHORITY` Ed25519 signature verification on `SOS_ACK`).
 * - Controlled flooding with Seen-Cache deduplication, TTL decrement (default 8, SOS/SOS_ACK 12),
 *   direct-neighbor fast path, jittered forwarding, and ≥2 neighbor overhear suppression.
 * - Persistent Store-and-Forward Outbox with Anti-Entropy `SYNC_INV` / `SYNC_REQ` reconciliation.
 * - Replay protection (timestamp window + nonce + seen-cache) and per-peer rate limiting / reputation.
 */

import nacl from 'tweetnacl';
import {
  AckCleartext,
  DirectMessageCleartext,
  HazardCategory,
  HazardCleartext,
  HelloCleartext,
  LocationPrecision,
  MeshActivityMetrics,
  MeshPacket,
  PeerNode,
  PowerMode,
  PriorityLevel,
  ResponderAckRecord,
  SafeCleartext,
  SOSCategoryId,
  SOSCleartext,
  SosAckCleartext,
  StoredHazardReport,
  StoredMessage,
  StoredSOSAlert,
  SyncInvCleartext,
  SyncReqCleartext,
} from './types';
import {
  bytesToBase64,
  bytesToUtf8,
  computeSha256LikeHex,
  generatePacketId,
  NodeIdentity,
  utf8ToBytes,
} from '../crypto/identity';
import { signPacket, verifyPacketSignature } from '../crypto/sign';
import { decryptDirectPayload, encryptDirectPayload } from '../crypto/e2e';
import { decryptChannelPayload, encryptChannelPayload } from '../crypto/channel';
import { evaluatePeerTrust } from '../crypto/qr';
import {
  ResponderCertificate,
  verifyResponderCertificate,
} from '../crypto/responderCert';
import {
  sealPreciseLocation,
  unsealPreciseLocation,
} from '../crypto/sealedLocation';
import { SeenCache } from './seenCache';
import { MeshPriorityQueue } from './priority';
import { StoreAndForwardOutbox } from './outbox';
import { buildSyncInventory, computeMissingPacketIds } from './sync';
import { computePowerSchedule, resolveAutoPowerMode } from './power';
import { Transport, TransportPeerEvent } from '../transport/Transport';
import { classifyEmergencyOffline } from '../ai/fallbackClassifier';
import { MESH_CONSTANTS } from './constants';
import {
  MeshQualitySnapshot,
  MetricLogger,
  PacketDropReason,
} from './metrics';

const MAX_PACKET_BYTES = MESH_CONSTANTS.MAX_PACKET_BYTES;
const MAX_TEXT_CHARS = MESH_CONSTANTS.MAX_TEXT_CHARS;
const REPLAY_WINDOW_MS = MESH_CONSTANTS.REPLAY_WINDOW_MS; // ±5 minutes per spec
const MAX_INVALID_SIGS_BEFORE_BAN = MESH_CONSTANTS.MAX_INVALID_SIGS_BEFORE_BAN;
const RATE_LIMIT_CAPACITY = MESH_CONSTANTS.RATE_LIMIT_CAPACITY;

export interface PacketDropLogEntry {
  ts: number;
  packetId: string;
  fromPeerId: string;
  reason: PacketDropReason;
  detail: string;
}

export interface MeshEngineOptions {
  identity: NodeIdentity;
  transport: Transport;
  channelKeySecret?: string;
  responderCert?: ResponderCertificate | null;
  /** Jitter range ms for relay forwarding (set to 0 in unit tests for synchronous deterministic runs) */
  relayJitterMs?: number;
  initialPowerMode?: PowerMode;
  initialBatteryPct?: number;
}

export class MeshEngine {
  public readonly identity: NodeIdentity;
  public readonly transport: Transport;
  public readonly seenCache: SeenCache;
  public readonly priorityQueue: MeshPriorityQueue;
  public readonly outbox: StoreAndForwardOutbox;
  public readonly metricLogger: MetricLogger;

  private channelKeySecret?: string;
  private responderCert: ResponderCertificate | null;
  private readonly relayJitterMs: number;
  private preferredPowerMode: PowerMode;
  private batteryPct: number;
  private isCharging = false;

  private readonly peers = new Map<string, PeerNode>();
  private readonly messages = new Map<string, StoredMessage>();
  private readonly alerts = new Map<string, StoredSOSAlert>();
  private readonly hazards = new Map<string, StoredHazardReport>();
  private readonly safetyChecks = new Map<string, SafeCleartext & { id: string; senderId: string; timestamp: number; hops: number; route: string[] }>();
  private readonly relayPacketStore = new Map<string, MeshPacket>();
  private readonly pendingRelayTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly dropLog: PacketDropLogEntry[] = [];

  private packetsSent = 0;
  private packetsReceived = 0;
  private packetsRelayed = 0;
  private packetsDroppedInvalidSig = 0;
  private packetsSuppressedDuplicate = 0;
  private syncInventoriesExchanged = 0;

  private unsubPeer?: () => void;
  private unsubPacket?: () => void;
  private stateListeners = new Set<() => void>();

  constructor(options: MeshEngineOptions) {
    this.identity = options.identity;
    this.transport = options.transport;
    this.channelKeySecret = options.channelKeySecret;
    this.responderCert = options.responderCert ?? null;
    this.relayJitterMs = options.relayJitterMs ?? MESH_CONSTANTS.JITTER_NORMAL_MAX_MS;
    this.preferredPowerMode = options.initialPowerMode ?? 'active';
    this.batteryPct = options.initialBatteryPct ?? 88;

    this.seenCache = new SeenCache();
    this.priorityQueue = new MeshPriorityQueue();
    this.outbox = new StoreAndForwardOutbox();
    this.metricLogger = new MetricLogger();
  }

  public async start(): Promise<void> {
    this.unsubPeer = this.transport.onPeer((ev) => {
      return this.handlePeerEvent(ev);
    });
    this.unsubPacket = this.transport.onPacket((fromPeerId, bytes) => {
      return this.handleRawBytes(fromPeerId, bytes);
    });
    await this.transport.start();

    // Immediately broadcast HELLO to any already-present neighbors
    await this.broadcastHello();
  }

  public async stop(): Promise<void> {
    for (const timer of this.pendingRelayTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingRelayTimers.clear();
    this.unsubPeer?.();
    this.unsubPacket?.();
    await this.transport.stop();
  }

  public getPendingRelayCount(): number {
    return this.pendingRelayTimers.size;
  }

  public getDropLog(): PacketDropLogEntry[] {
    return [...this.dropLog];
  }

  private recordDrop(
    packetId: string,
    fromPeerId: string,
    reason: PacketDropReason,
    detail: string
  ): void {
    this.metricLogger.recordDrop(reason);
    this.dropLog.push({
      ts: Date.now(),
      packetId,
      fromPeerId,
      reason,
      detail,
    });
    if (this.dropLog.length > 200) {
      this.dropLog.shift();
    }
  }

  public getMeshQualitySnapshot(): MeshQualitySnapshot {
    const activity = this.getActivityMetrics();
    return this.metricLogger.getSnapshot({
      packetsRelayed: this.packetsRelayed,
      packetsSuppressedDuplicate: this.packetsSuppressedDuplicate,
      scanDutyCyclePct: activity.scanDutyCyclePct,
      queueSizesByPriority: this.priorityQueue.sizeByPriority(),
    });
  }

  public onStateChange(cb: () => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private notifyStateChange(): void {
    for (const cb of this.stateListeners) {
      cb();
    }
  }

  public setChannelKeySecret(secret?: string): void {
    this.channelKeySecret = secret;
    this.notifyStateChange();
  }

  public getChannelKeySecret(): string | undefined {
    return this.channelKeySecret;
  }

  public setResponderCertificate(cert: ResponderCertificate | null): void {
    this.responderCert = cert;
    // Re-evaluate sealed precise coordinates on existing alerts when responder cert changes
    for (const alert of this.alerts.values()) {
      if (alert.sealedPreciseLocation) {
        if (cert) {
          const unsealed = unsealPreciseLocation(
            alert.sealedPreciseLocation,
            cert
          );
          alert.unsealedPreciseLocation = unsealed
            ? {
                lat: unsealed.lat,
                lng: unsealed.lng,
                accuracyMeters: unsealed.accuracyMeters,
              }
            : null;
        } else if (alert.senderId !== this.identity.nodeId) {
          alert.unsealedPreciseLocation = null;
        }
      }
    }
    this.notifyStateChange();
  }

  public getResponderCertificate(): ResponderCertificate | null {
    return this.responderCert;
  }

  public setPowerPreference(mode: PowerMode): void {
    this.preferredPowerMode = mode;
    this.notifyStateChange();
  }

  public setBatteryState(batteryPct: number, isCharging = false): void {
    this.batteryPct = Math.max(1, Math.min(100, Math.round(batteryPct)));
    this.isCharging = isCharging;
    this.notifyStateChange();
  }

  public getEffectivePowerMode(): PowerMode {
    return resolveAutoPowerMode(
      this.batteryPct,
      this.isCharging,
      this.preferredPowerMode
    );
  }

  public getActivityMetrics(): MeshActivityMetrics {
    const mode = this.getEffectivePowerMode();
    const connectedCount = Array.from(this.peers.values()).filter(
      (p) => p.isDirectNeighbor
    ).length;
    const schedule = computePowerSchedule(mode, this.batteryPct, connectedCount);

    return {
      powerMode: mode,
      batteryPct: this.batteryPct,
      isCharging: this.isCharging,
      scanDutyCyclePct: schedule.dutyCyclePct,
      scanWindowMs: schedule.scanWindowMs,
      sleepWindowMs: schedule.sleepWindowMs,
      packetsSent: this.packetsSent,
      packetsReceived: this.packetsReceived,
      packetsRelayed: this.packetsRelayed,
      packetsDroppedInvalidSig: this.packetsDroppedInvalidSig,
      packetsSuppressedDuplicate: this.packetsSuppressedDuplicate,
      syncInventoriesExchanged: this.syncInventoriesExchanged,
    };
  }

  public getPeers(): PeerNode[] {
    return Array.from(this.peers.values()).sort((a, b) => {
      if (a.isDirectNeighbor !== b.isDirectNeighbor) {
        return a.isDirectNeighbor ? -1 : 1;
      }
      return a.hopsAway - b.hopsAway || b.lastSeenTs - a.lastSeenTs;
    });
  }

  public getPeer(nodeId: string): PeerNode | undefined {
    return this.peers.get(nodeId);
  }

  public registerContactPublicKey(
    nodeId: string,
    displayName: string,
    signPub: string,
    boxPub: string,
    verifiedViaQr = false
  ): PeerNode {
    const existing = this.peers.get(nodeId);
    const trustStatus = evaluatePeerTrust(
      existing,
      signPub,
      boxPub,
      verifiedViaQr
    );

    const updated: PeerNode = {
      nodeId,
      displayName: displayName || existing?.displayName || `NODE-${nodeId.slice(0, 4)}`,
      signPub,
      boxPub,
      lastSeenTs: Date.now(),
      rssi: existing?.rssi ?? -60,
      linkQuality: existing?.linkQuality ?? 85,
      hopsAway: existing?.hopsAway ?? 1,
      isDirectNeighbor: existing?.isDirectNeighbor ?? false,
      trustStatus,
      batteryPct: existing?.batteryPct,
      powerMode: existing?.powerMode,
      invalidSigCount: existing?.invalidSigCount ?? 0,
      rateLimitTokens: existing?.rateLimitTokens ?? RATE_LIMIT_CAPACITY,
      lastRateTickTs: existing?.lastRateTickTs ?? Date.now(),
    };
    this.peers.set(nodeId, updated);
    this.notifyStateChange();
    return updated;
  }

  public getMessages(): StoredMessage[] {
    return Array.from(this.messages.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }

  public getAlerts(): StoredSOSAlert[] {
    return Array.from(this.alerts.values()).sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return a.hops - b.hops;
    });
  }

  public getHazards(): StoredHazardReport[] {
    const now = Date.now();
    return Array.from(this.hazards.values())
      .filter((h) => h.expiresAt > now)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  public getSafetyChecks(): Array<SafeCleartext & { id: string; senderId: string; timestamp: number; hops: number; route: string[] }> {
    return Array.from(this.safetyChecks.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /**
   * Broadcasts a signed `HELLO` packet to direct neighbors.
   */
  public async broadcastHello(): Promise<void> {
    const cleartext: HelloCleartext = {
      displayName: this.identity.displayName,
      signPub: this.identity.signPublicKeyB64,
      boxPub: this.identity.boxPublicKeyB64,
      batteryPct: this.batteryPct,
      powerMode: this.getEffectivePowerMode(),
    };

    const packet = this.createSignedPacket({
      type: 'HELLO',
      prio: 3,
      ttl: 2,
      dst: 'BROADCAST',
      nonce: bytesToBase64(nacl.randomBytes(24)),
      payload: bytesToBase64(utf8ToBytes(JSON.stringify(cleartext))),
    });

    this.seenCache.markSeenAndRecordNeighbor(packet.id, this.identity.nodeId);
    await this.transmitToNeighbors(packet);
  }

  /**
   * Sends an End-to-End Encrypted (X25519 + XSalsa20-Poly1305) Direct Message (`MSG`).
   */
  public async sendDirectMessage(
    recipientNodeId: string,
    rawText: string,
    priority: PriorityLevel = 2
  ): Promise<StoredMessage> {
    const text = rawText.trim().slice(0, MAX_TEXT_CHARS);
    if (!text) {
      throw new Error('Message text cannot be empty');
    }

    const peer = this.peers.get(recipientNodeId);
    if (!peer || !peer.boxPub) {
      throw new Error(
        `Recipient ${recipientNodeId} public key unknown. Exchange HELLO or scan QR first.`
      );
    }

    const cleartext: DirectMessageCleartext = {
      text,
      senderName: this.identity.displayName,
    };

    const encrypted = encryptDirectPayload(
      cleartext,
      peer.boxPub,
      this.identity.boxSecretKeyB64
    );

    const packet = this.createSignedPacket({
      type: 'MSG',
      prio: priority,
      ttl: MESH_CONSTANTS.TTL_NORMAL,
      dst: recipientNodeId,
      nonce: encrypted.nonceB64,
      payload: encrypted.ciphertextB64,
    });

    this.seenCache.markSeenAndRecordNeighbor(packet.id, this.identity.nodeId);
    this.outbox.upsert(packet);
    this.relayPacketStore.set(packet.id, packet);
    this.metricLogger.recordPacketSent(packet.id, priority, packet.ts);

    const stored: StoredMessage = {
      id: packet.id,
      conversationId: recipientNodeId,
      direction: 'outbound',
      senderId: this.identity.nodeId,
      senderName: this.identity.displayName,
      recipientId: recipientNodeId,
      text,
      priority,
      timestamp: packet.ts,
      deliveryState: 'PENDING',
      relayedHops: 0,
      route: [this.identity.nodeId],
      reachedNodes: [],
      packet,
      signatureValid: true,
      cipherSuite: 'X25519-XSalsa20-Poly1305',
      packetHashHex: computeSha256LikeHex(JSON.stringify(packet)),
    };

    this.messages.set(packet.id, stored);

    const handedToAnyNeighbor = await this.dispatchPacket(packet);
    if (handedToAnyNeighbor && stored.deliveryState === 'PENDING') {
      stored.deliveryState = 'SENT';
    }
    this.notifyStateChange();
    return stored;
  }

  /**
   * Broadcasts a Priority-0 signed + channel-encrypted SOS beacon across the mesh (TTL 12).
   * Per §5 & §9.2:
   * - If `locationPrecision === 'precise'`, exact coordinates are sealed (`nacl.box`) to the Responder Group public key,
   *   while only coarse (~1km) coordinates are placed in cleartext `lat`/`lng` for general mesh nodes.
   */
  public async broadcastSOS(params: {
    category: SOSCategoryId;
    text: string;
    headcount: number;
    locationPrecision: LocationPrecision;
    lat?: number;
    lng?: number;
    pictogramId?: string;
    isLastGasp?: boolean;
  }): Promise<StoredSOSAlert> {
    const text = params.text.trim().slice(0, MAX_TEXT_CHARS);
    const hasCoords = params.lat !== undefined && params.lng !== undefined;
    const coarseLat =
      params.locationPrecision !== 'disabled' && hasCoords
        ? Math.round((params.lat as number) * 100) / 100
        : undefined;
    const coarseLng =
      params.locationPrecision !== 'disabled' && hasCoords
        ? Math.round((params.lng as number) * 100) / 100
        : undefined;

    const sealedPreciseLocation =
      params.locationPrecision === 'precise' && hasCoords
        ? sealPreciseLocation({
            lat: params.lat as number,
            lng: params.lng as number,
            accuracyMeters: 8,
            altitudeMeters: 912,
          })
        : undefined;

    const cleartext: SOSCleartext = {
      category: params.category,
      text,
      senderName: this.identity.displayName,
      headcount: Math.max(1, params.headcount),
      locationPrecision: params.locationPrecision,
      lat: coarseLat,
      lng: coarseLng,
      sealedPreciseLocation,
      pictogramId: params.pictogramId,
      isLastGasp: params.isLastGasp,
    };

    const encrypted = encryptChannelPayload(cleartext, this.channelKeySecret);
    const packet = this.createSignedPacket({
      type: 'SOS',
      prio: 0,
      ttl: MESH_CONSTANTS.TTL_SOS,
      dst: 'BROADCAST',
      nonce: encrypted.nonceB64,
      payload: encrypted.ciphertextB64,
    });

    this.seenCache.markSeenAndRecordNeighbor(packet.id, this.identity.nodeId);
    this.outbox.upsert(packet);
    this.relayPacketStore.set(packet.id, packet);
    this.metricLogger.recordPacketSent(packet.id, 0, packet.ts);

    const hint = classifyEmergencyOffline(text);
    const alert: StoredSOSAlert = {
      id: packet.id,
      senderId: this.identity.nodeId,
      senderName: this.identity.displayName,
      category: params.category,
      text,
      headcount: cleartext.headcount,
      priority: 0,
      timestamp: packet.ts,
      hops: 0,
      route: [this.identity.nodeId],
      locationPrecision: params.locationPrecision,
      lat: coarseLat,
      lng: coarseLng,
      sealedPreciseLocation,
      unsealedPreciseLocation:
        params.locationPrecision === 'precise' && hasCoords
          ? {
              lat: params.lat as number,
              lng: params.lng as number,
              accuracyMeters: 8,
            }
          : null,
      pictogramId: params.pictogramId,
      isLastGasp: params.isLastGasp,
      acknowledgedByMe: true,
      respondingByMe: false,
      reachedNodeIds: [],
      responderAcks: [],
      bridgedOnline: false,
      packet,
      signatureValid: true,
      offlineUrgencyHint: {
        level: hint.level,
        matchedKeywords: hint.matchedKeywords,
        reason: hint.reason,
      },
    };
    this.alerts.set(packet.id, alert);

    // Also record in messages list under BROADCAST so user can inspect SOS packet/route/crypto
    const msgEntry: StoredMessage = {
      id: packet.id,
      conversationId: 'BROADCAST',
      direction: 'outbound',
      senderId: this.identity.nodeId,
      senderName: this.identity.displayName,
      recipientId: 'BROADCAST',
      text: `[SOS · ${params.category.toUpperCase()}] ${text}`,
      priority: 0,
      timestamp: packet.ts,
      deliveryState: 'PENDING',
      relayedHops: 0,
      route: [this.identity.nodeId],
      reachedNodes: [],
      packet,
      signatureValid: true,
      cipherSuite: 'Channel-XSalsa20-Poly1305',
      packetHashHex: computeSha256LikeHex(JSON.stringify(packet)),
    };
    this.messages.set(packet.id, msgEntry);

    const sent = await this.dispatchPacket(packet);
    if (sent) {
      msgEntry.deliveryState = 'SENT';
    }
    this.notifyStateChange();
    return alert;
  }

  /**
   * Sends a signed `SOS_ACK` packet (Closed-Loop SOS Status Tracker §8.6 & §9.1)
   * carrying the responder's Authority-signed `ResponderCertificate` (if enrolled).
   */
  public async sendSosAck(
    alertId: string,
    status: 'ACKNOWLEDGED' | 'RESPONDING',
    note?: string
  ): Promise<ResponderAckRecord | null> {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.acknowledgedByMe = true;
    if (status === 'RESPONDING') {
      alert.respondingByMe = true;
    }

    const ackCleartext: SosAckCleartext = {
      targetAlertId: alert.id,
      responderName: this.identity.displayName,
      status,
      note,
      recordedRoute: alert.route.includes(this.identity.nodeId)
        ? alert.route
        : [...alert.route, this.identity.nodeId],
      responderCert: this.responderCert ?? undefined,
    };

    const packet = this.createSignedPacket({
      type: 'SOS_ACK',
      prio: 0,
      ttl: 12,
      dst: alert.senderId,
      nonce: bytesToBase64(nacl.randomBytes(24)),
      payload: bytesToBase64(utf8ToBytes(JSON.stringify(ackCleartext))),
    });

    this.seenCache.markSeenAndRecordNeighbor(packet.id, this.identity.nodeId);
    this.outbox.upsert(packet);
    this.relayPacketStore.set(packet.id, packet);

    const certCheck = verifyResponderCertificate(
      this.responderCert,
      this.identity.nodeId
    );

    const record: ResponderAckRecord = {
      ackPacketId: packet.id,
      responderId: this.identity.nodeId,
      responderName: this.identity.displayName,
      status,
      timestamp: packet.ts,
      hops: 0,
      route: [this.identity.nodeId],
      verifiedCert: certCheck.valid,
      certRole: certCheck.role,
      certOrg: certCheck.organizationName,
      note,
    };

    const existingIdx = alert.responderAcks.findIndex(
      (r) => r.responderId === this.identity.nodeId
    );
    if (existingIdx >= 0) {
      alert.responderAcks[existingIdx] = record;
    } else {
      alert.responderAcks.push(record);
    }

    await this.dispatchPacket(packet);
    this.notifyStateChange();
    return record;
  }

  /**
   * Backward-compatible helper for AlertsFeedScreen buttons.
   */
  public async respondToSOSAlert(
    alertId: string,
    mode: 'RELAY_RECEIPT' | 'SOS_RESPONDING',
    note?: string
  ): Promise<void> {
    if (mode === 'SOS_RESPONDING') {
      await this.sendSosAck(alertId, 'RESPONDING', note || 'En route to coordinates');
    } else {
      await this.sendSosAck(alertId, 'ACKNOWLEDGED', note || 'Copy SOS, standing by');
    }
  }

  /**
   * Broadcasts a signed `SAFE` ("I'm safe" / Circle check-in) packet (§8.9, §8.10, §9.3).
   */
  public async broadcastSafetyCheck(params: {
    circleId: string;
    circleName: string;
    status: 'SAFE' | 'NEEDS_ASSISTANCE';
    note: string;
    locationLabel?: string;
  }): Promise<MeshPacket> {
    const cleartext: SafeCleartext = {
      circleId: params.circleId,
      circleName: params.circleName,
      senderName: this.identity.displayName,
      status: params.status,
      note: params.note.trim().slice(0, 240),
      locationLabel: params.locationLabel,
      batteryPct: this.batteryPct,
    };

    const packet = this.createSignedPacket({
      type: 'SAFE',
      prio: 1,
      ttl: 10,
      dst: 'BROADCAST',
      nonce: bytesToBase64(nacl.randomBytes(24)),
      payload: bytesToBase64(utf8ToBytes(JSON.stringify(cleartext))),
    });

    this.seenCache.markSeenAndRecordNeighbor(packet.id, this.identity.nodeId);
    this.outbox.upsert(packet);
    this.relayPacketStore.set(packet.id, packet);

    this.safetyChecks.set(packet.id, {
      ...cleartext,
      id: packet.id,
      senderId: this.identity.nodeId,
      timestamp: packet.ts,
      hops: 0,
      route: [this.identity.nodeId],
    });

    await this.dispatchPacket(packet);
    this.notifyStateChange();
    return packet;
  }

  /**
   * Broadcasts a signed `HAZARD` report packet with TTL expiry (§8.11).
   */
  public async broadcastHazardReport(params: {
    category: HazardCategory;
    title: string;
    description: string;
    lat: number;
    lng: number;
    ttlMinutes?: number;
  }): Promise<StoredHazardReport> {
    const now = Date.now();
    const expiresAt = now + (params.ttlMinutes ?? 120) * 60 * 1000;
    const cleartext: HazardCleartext = {
      category: params.category,
      title: params.title.trim().slice(0, 120),
      description: params.description.trim().slice(0, 320),
      senderName: this.identity.displayName,
      lat: params.lat,
      lng: params.lng,
      expiresAt,
    };

    const packet = this.createSignedPacket({
      type: 'HAZARD',
      prio: 1,
      ttl: 10,
      dst: 'BROADCAST',
      nonce: bytesToBase64(nacl.randomBytes(24)),
      payload: bytesToBase64(utf8ToBytes(JSON.stringify(cleartext))),
    });

    this.seenCache.markSeenAndRecordNeighbor(packet.id, this.identity.nodeId);
    this.outbox.upsert(packet);
    this.relayPacketStore.set(packet.id, packet);

    const report: StoredHazardReport = {
      id: packet.id,
      senderId: this.identity.nodeId,
      senderName: this.identity.displayName,
      category: params.category,
      title: cleartext.title,
      description: cleartext.description,
      lat: params.lat,
      lng: params.lng,
      timestamp: packet.ts,
      expiresAt,
      hops: 0,
      route: [this.identity.nodeId],
      signatureValid: true,
      packet,
    };

    this.hazards.set(packet.id, report);
    await this.dispatchPacket(packet);
    this.notifyStateChange();
    return report;
  }

  private createSignedPacket(params: {
    type: MeshPacket['type'];
    prio: PriorityLevel;
    ttl: number;
    dst: string;
    nonce: string;
    payload: string;
  }): MeshPacket {
    const unsigned: Omit<MeshPacket, 'sig'> = {
      v: 1,
      id: generatePacketId(),
      type: params.type,
      prio: params.prio,
      ttl: params.ttl,
      hops: 0,
      src: this.identity.nodeId,
      srcSignPub: this.identity.signPublicKeyB64,
      srcBoxPub: this.identity.boxPublicKeyB64,
      dst: params.dst,
      ts: Date.now(),
      nonce: params.nonce,
      payload: params.payload,
      route: [this.identity.nodeId],
    };

    const sig = signPacket(unsigned, this.identity.signSecretKeyB64);
    return {
      ...unsigned,
      sig,
    };
  }

  private async handlePeerEvent(ev: TransportPeerEvent): Promise<void> {
    if (ev.status === 'lost') {
      const peer = this.peers.get(ev.peerId);
      if (peer) {
        peer.isDirectNeighbor = false;
        this.notifyStateChange();
      }
      return;
    }

    // Peer found: exchange HELLO and anti-entropy SYNC_INV immediately
    await this.broadcastHello();
    await this.sendSyncInventoryTo(ev.peerId);
  }

  public async sendSyncInventoryTo(peerId: string): Promise<void> {
    const buffered = [
      ...this.outbox.getAllBufferedPackets(),
      ...Array.from(this.relayPacketStore.values()),
    ];
    const uniqueMap = new Map<string, MeshPacket>();
    for (const p of buffered) {
      uniqueMap.set(p.id, p);
    }

    const inv = buildSyncInventory(Array.from(uniqueMap.values()));
    const packet = this.createSignedPacket({
      type: 'SYNC_INV',
      prio: 3,
      ttl: 2,
      dst: peerId,
      nonce: bytesToBase64(nacl.randomBytes(24)),
      payload: bytesToBase64(utf8ToBytes(JSON.stringify(inv))),
    });
    this.seenCache.markSeenAndRecordNeighbor(packet.id, this.identity.nodeId);
    this.syncInventoriesExchanged += 1;
    await this.sendPacketToPeer(peerId, packet);
  }

  private checkRateLimitAndReputation(fromPeerId: string): boolean {
    const peer = this.peers.get(fromPeerId);
    if (!peer) return true;
    if (peer.invalidSigCount >= MAX_INVALID_SIGS_BEFORE_BAN) {
      return false; // Peer banned for repeated invalid signatures
    }

    const now = Date.now();
    const elapsedSec = (now - peer.lastRateTickTs) / 1000;
    if (elapsedSec > 0) {
      peer.rateLimitTokens = Math.min(
        RATE_LIMIT_CAPACITY,
        peer.rateLimitTokens + elapsedSec * 8
      );
      peer.lastRateTickTs = now;
    }

    if (peer.rateLimitTokens < 1) {
      return false;
    }
    peer.rateLimitTokens -= 1;
    return true;
  }

  private recordInvalidSignatureFrom(peerId: string): void {
    this.packetsDroppedInvalidSig += 1;
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.invalidSigCount += 1;
    }
    this.notifyStateChange();
  }

  private async handleRawBytes(
    fromPeerId: string,
    bytes: Uint8Array
  ): Promise<void> {
    if (bytes.byteLength > MAX_PACKET_BYTES) {
      this.recordDrop(
        'oversized',
        fromPeerId,
        'oversized',
        `Packet size ${bytes.byteLength}B exceeds ${MAX_PACKET_BYTES}B`
      );
      return;
    }
    if (!this.checkRateLimitAndReputation(fromPeerId)) {
      this.recordDrop(
        'rate_limited',
        fromPeerId,
        'rate_limited',
        `Peer ${fromPeerId} exceeded rate limit or reputation ban`
      );
      return;
    }

    let packet: MeshPacket;
    try {
      packet = JSON.parse(bytesToUtf8(bytes)) as MeshPacket;
    } catch {
      return;
    }

    if (!packet || packet.v !== 1 || !packet.id || !packet.sig) {
      return;
    }

    // 1. Replay timestamp window check (±5 minutes per Priority 1 spec)
    const now = Date.now();
    if (Math.abs(now - packet.ts) > REPLAY_WINDOW_MS) {
      this.recordDrop(
        packet.id,
        fromPeerId,
        'replay_window',
        `Timestamp delta ${Math.abs(now - packet.ts)}ms outside ±${REPLAY_WINDOW_MS}ms window`
      );
      return;
    }

    // 2. Cryptographic signature verification (Ed25519) before ANY processing or relay
    if (!verifyPacketSignature(packet)) {
      this.recordInvalidSignatureFrom(fromPeerId);
      this.recordDrop(
        packet.id,
        fromPeerId,
        'invalid_signature',
        `Ed25519 signature invalid from ${fromPeerId} (origin ${packet.src})`
      );
      return;
    }

    // 3. Seen-cache deduplication & overhear counter update + active jitter cancel
    const isFirstTime = this.seenCache.markSeenAndRecordNeighbor(
      packet.id,
      fromPeerId,
      now
    );
    if (!isFirstTime) {
      this.packetsSuppressedDuplicate += 1;
      this.recordDrop(
        packet.id,
        fromPeerId,
        'seen_duplicate',
        `Duplicate packet ID ${packet.id} overheard from ${fromPeerId}`
      );

      // Active Jitter & Suppression cancellation: if we have a pending relay timer for this packet
      // and have now heard it from >= 2 distinct neighbors while waiting, cancel the forward!
      const pendingTimer = this.pendingRelayTimers.get(packet.id);
      if (
        pendingTimer &&
        this.seenCache.shouldSuppressForward(
          packet.id,
          MESH_CONSTANTS.OVERHEAR_SUPPRESSION_THRESHOLD
        )
      ) {
        clearTimeout(pendingTimer);
        this.pendingRelayTimers.delete(packet.id);
      }
      return;
    }

    this.packetsReceived += 1;

    // 4. Learn/update origin peer public keys from verified packet header
    const existingOrigin = this.peers.get(packet.src);
    const isDirect = fromPeerId === packet.src;
    const trustStatus = evaluatePeerTrust(
      existingOrigin,
      packet.srcSignPub,
      packet.srcBoxPub,
      false
    );

    this.peers.set(packet.src, {
      nodeId: packet.src,
      displayName: existingOrigin?.displayName || `NODE-${packet.src.slice(0, 4)}`,
      signPub: packet.srcSignPub,
      boxPub: packet.srcBoxPub,
      lastSeenTs: now,
      rssi: existingOrigin?.rssi ?? -58,
      linkQuality: existingOrigin?.linkQuality ?? 90,
      hopsAway: isDirect ? 1 : packet.hops + 1,
      isDirectNeighbor: isDirect ? true : existingOrigin?.isDirectNeighbor ?? false,
      trustStatus,
      batteryPct: existingOrigin?.batteryPct,
      powerMode: existingOrigin?.powerMode,
      invalidSigCount: existingOrigin?.invalidSigCount ?? 0,
      rateLimitTokens: existingOrigin?.rateLimitTokens ?? RATE_LIMIT_CAPACITY,
      lastRateTickTs: now,
    });

    const routeWithMe = packet.route.includes(this.identity.nodeId)
      ? packet.route
      : [...packet.route, this.identity.nodeId];

    // 5. Handle packet by type
    switch (packet.type) {
      case 'HELLO': {
        await this.handleHelloPacket(packet, isDirect);
        break;
      }
      case 'SYNC_INV': {
        await this.handleSyncInvPacket(packet, fromPeerId);
        break;
      }
      case 'SYNC_REQ': {
        await this.handleSyncReqPacket(packet, fromPeerId);
        break;
      }
      case 'ACK': {
        await this.handleAckPacket(packet, fromPeerId, routeWithMe);
        break;
      }
      case 'MSG': {
        await this.handleDirectMsgPacket(packet, fromPeerId, routeWithMe);
        break;
      }
      case 'SOS': {
        await this.handleSosPacket(packet, fromPeerId, routeWithMe);
        break;
      }
      case 'SOS_ACK': {
        await this.handleSosAckPacket(packet, fromPeerId, routeWithMe);
        break;
      }
      case 'SAFE': {
        await this.handleSafePacket(packet, fromPeerId, routeWithMe);
        break;
      }
      case 'HAZARD': {
        await this.handleHazardPacket(packet, fromPeerId, routeWithMe);
        break;
      }
    }

    this.notifyStateChange();
  }

  private async handleHelloPacket(
    packet: MeshPacket,
    isDirect: boolean
  ): Promise<void> {
    try {
      const hello = JSON.parse(
        bytesToUtf8(base64ToBytesSafe(packet.payload))
      ) as HelloCleartext;
      const peer = this.peers.get(packet.src);
      if (peer) {
        peer.displayName = hello.displayName || peer.displayName;
        peer.batteryPct = hello.batteryPct;
        peer.powerMode = hello.powerMode;
        if (isDirect) {
          peer.isDirectNeighbor = true;
          peer.hopsAway = 1;
        }
      }

      // Trigger epidemic outbox retry when we hear a HELLO
      await this.flushOutboxToNewPeer(packet.src);
    } catch {
      // Malformed HELLO cleartext
    }
  }

  private async handleSyncInvPacket(
    packet: MeshPacket,
    fromPeerId: string
  ): Promise<void> {
    try {
      const inv = JSON.parse(
        bytesToUtf8(base64ToBytesSafe(packet.payload))
      ) as SyncInvCleartext;

      const req = computeMissingPacketIds(inv.packetIds, (id) => {
        return (
          this.seenCache.hasSeen(id) ||
          this.relayPacketStore.has(id) ||
          this.outbox.get(id) !== undefined
        );
      });

      if (req.missingIds.length > 0) {
        const reqPacket = this.createSignedPacket({
          type: 'SYNC_REQ',
          prio: 3,
          ttl: 2,
          dst: fromPeerId,
          nonce: bytesToBase64(nacl.randomBytes(24)),
          payload: bytesToBase64(utf8ToBytes(JSON.stringify(req))),
        });
        this.seenCache.markSeenAndRecordNeighbor(
          reqPacket.id,
          this.identity.nodeId
        );
        await this.sendPacketToPeer(fromPeerId, reqPacket);
      }
    } catch {
      // Ignore malformed SYNC_INV
    }
  }

  private async handleSyncReqPacket(
    packet: MeshPacket,
    fromPeerId: string
  ): Promise<void> {
    try {
      const req = JSON.parse(
        bytesToUtf8(base64ToBytesSafe(packet.payload))
      ) as SyncReqCleartext;

      for (const wantedId of req.missingIds) {
        const stored =
          this.relayPacketStore.get(wantedId) ??
          this.outbox.get(wantedId)?.packet;
        if (stored) {
          await this.sendPacketToPeer(fromPeerId, stored);
        }
      }
    } catch {
      // Ignore malformed SYNC_REQ
    }
  }

  private async handleAckPacket(
    packet: MeshPacket,
    fromPeerId: string,
    routeWithMe: string[]
  ): Promise<void> {
    try {
      const ack = JSON.parse(
        bytesToUtf8(base64ToBytesSafe(packet.payload))
      ) as AckCleartext;

      const msg = this.messages.get(ack.targetPacketId);
      if (msg) {
        if (!msg.reachedNodes.includes(packet.src)) {
          msg.reachedNodes.push(packet.src);
        }
        if (ack.recordedRoute && ack.recordedRoute.length > msg.route.length) {
          msg.route = ack.recordedRoute;
          msg.relayedHops = Math.max(0, ack.recordedRoute.length - 1);
        }

        if (ack.ackKind === 'DELIVERED' && packet.src === msg.recipientId) {
          msg.deliveryState = 'DELIVERED';
          this.outbox.markAcknowledged(ack.targetPacketId, packet.src, true);
          this.metricLogger.recordPacketDelivered(
            ack.targetPacketId,
            msg.priority,
            Math.max(1, msg.relayedHops || packet.hops + 1),
            Date.now()
          );
        } else if (
          ack.ackKind === 'RELAY_RECEIPT' &&
          msg.deliveryState !== 'DELIVERED'
        ) {
          msg.deliveryState = 'RELAYED';
          msg.relayedHops = Math.max(
            msg.relayedHops,
            ack.recordedRoute.length - 1
          );
          this.outbox.markAcknowledged(ack.targetPacketId, packet.src, false);
        }
      }

      const alert = this.alerts.get(ack.targetPacketId);
      if (alert) {
        if (!alert.reachedNodeIds.includes(packet.src)) {
          alert.reachedNodeIds.push(packet.src);
        }
      }

      // If this ACK is destined for another node, relay it along the mesh
      if (packet.dst !== this.identity.nodeId) {
        await this.maybeRelayPacket(packet, fromPeerId, routeWithMe);
      }
    } catch {
      // Ignore malformed ACK
    }
  }

  private async handleDirectMsgPacket(
    packet: MeshPacket,
    fromPeerId: string,
    routeWithMe: string[]
  ): Promise<void> {
    this.relayPacketStore.set(packet.id, {
      ...packet,
      route: routeWithMe,
    });

    if (packet.dst === this.identity.nodeId) {
      // We are the intended final recipient: decrypt E2E payload
      const decrypted = decryptDirectPayload<DirectMessageCleartext>(
        packet.payload,
        packet.nonce,
        packet.srcBoxPub,
        this.identity.boxSecretKeyB64
      );
      if (!decrypted) {
        return;
      }

      const peer = this.peers.get(packet.src);
      if (peer && decrypted.senderName) {
        peer.displayName = decrypted.senderName;
      }

      const stored: StoredMessage = {
        id: packet.id,
        conversationId: packet.src,
        direction: 'inbound',
        senderId: packet.src,
        senderName: decrypted.senderName || `NODE-${packet.src.slice(0, 4)}`,
        recipientId: this.identity.nodeId,
        text: decrypted.text,
        priority: packet.prio,
        timestamp: packet.ts,
        deliveryState: 'DELIVERED',
        relayedHops: packet.hops + 1,
        route: routeWithMe,
        reachedNodes: [this.identity.nodeId],
        packet: { ...packet, hops: packet.hops + 1, route: routeWithMe },
        signatureValid: true,
        cipherSuite: 'X25519-XSalsa20-Poly1305',
        packetHashHex: computeSha256LikeHex(JSON.stringify(packet)),
      };
      this.messages.set(packet.id, stored);

      // Return signed end-to-end ACK with full hop route
      await this.sendSignedAck(packet, 'DELIVERED', routeWithMe);
      return;
    }

    // We are an intermediate relay node: forward packet first, then emit signed RELAY_RECEIPT
    await this.maybeRelayPacket(packet, fromPeerId, routeWithMe);
    await this.sendSignedAck(packet, 'RELAY_RECEIPT', routeWithMe);
  }

  private async handleSosPacket(
    packet: MeshPacket,
    fromPeerId: string,
    routeWithMe: string[]
  ): Promise<void> {
    this.relayPacketStore.set(packet.id, {
      ...packet,
      route: routeWithMe,
    });

    // Attempt channel decryption with current emergency channel key
    const decrypted = decryptChannelPayload<SOSCleartext>(
      packet.payload,
      packet.nonce,
      this.channelKeySecret
    );

    if (decrypted) {
      // Only a node holding a valid Authority-signed ResponderCertificate can unseal exact coordinates (§5 & §9.2)
      let unsealedPreciseLocation: StoredSOSAlert['unsealedPreciseLocation'] = null;
      if (decrypted.sealedPreciseLocation && this.responderCert) {
        const unsealed = unsealPreciseLocation(
          decrypted.sealedPreciseLocation,
          this.responderCert
        );
        if (unsealed) {
          unsealedPreciseLocation = {
            lat: unsealed.lat,
            lng: unsealed.lng,
            accuracyMeters: unsealed.accuracyMeters,
          };
        }
      }

      const hint = classifyEmergencyOffline(decrypted.text);
      const alert: StoredSOSAlert = {
        id: packet.id,
        senderId: packet.src,
        senderName: decrypted.senderName || `NODE-${packet.src.slice(0, 4)}`,
        category: decrypted.category,
        text: decrypted.text,
        headcount: decrypted.headcount,
        priority: 0,
        timestamp: packet.ts,
        hops: packet.hops + 1,
        route: routeWithMe,
        locationPrecision: decrypted.locationPrecision,
        lat: decrypted.lat,
        lng: decrypted.lng,
        sealedPreciseLocation: decrypted.sealedPreciseLocation,
        unsealedPreciseLocation,
        pictogramId: decrypted.pictogramId,
        isLastGasp: decrypted.isLastGasp,
        acknowledgedByMe: false,
        respondingByMe: false,
        reachedNodeIds: [this.identity.nodeId],
        responderAcks: [],
        bridgedOnline: false,
        packet: { ...packet, hops: packet.hops + 1, route: routeWithMe },
        signatureValid: true,
        offlineUrgencyHint: {
          level: hint.level,
          matchedKeywords: hint.matchedKeywords,
          reason: hint.reason,
        },
      };
      this.alerts.set(packet.id, alert);
    }

    // Always relay SOS across the mesh first (TTL up to 12), then emit reach receipt
    await this.maybeRelayPacket(packet, fromPeerId, routeWithMe);
    if (decrypted) {
      await this.sendSignedAck(packet, 'RELAY_RECEIPT', routeWithMe);
    }
  }

  private async handleSosAckPacket(
    packet: MeshPacket,
    fromPeerId: string,
    routeWithMe: string[]
  ): Promise<void> {
    this.relayPacketStore.set(packet.id, {
      ...packet,
      route: routeWithMe,
    });

    try {
      const ack = JSON.parse(
        bytesToUtf8(base64ToBytesSafe(packet.payload))
      ) as SosAckCleartext;

      // Cryptographically verify Authority-signed ResponderCertificate against packet.src
      const certVerify = verifyResponderCertificate(
        ack.responderCert,
        packet.src
      );

      const alert = this.alerts.get(ack.targetAlertId);
      if (alert) {
        if (!alert.reachedNodeIds.includes(packet.src)) {
          alert.reachedNodeIds.push(packet.src);
        }

        const record: ResponderAckRecord = {
          ackPacketId: packet.id,
          responderId: packet.src,
          responderName:
            ack.responderName || `NODE-${packet.src.slice(0, 4)}`,
          status: ack.status,
          timestamp: packet.ts,
          hops: packet.hops + 1,
          route: routeWithMe,
          verifiedCert: certVerify.valid,
          certRole: certVerify.role,
          certOrg: certVerify.organizationName,
          note: ack.note,
        };

        const existingIdx = alert.responderAcks.findIndex(
          (r) => r.responderId === packet.src
        );
        if (existingIdx >= 0) {
          alert.responderAcks[existingIdx] = record;
        } else {
          alert.responderAcks.push(record);
        }

        // Record P0 SOS closed-loop ACK latency in MetricLogger
        this.metricLogger.recordPacketDelivered(
          ack.targetAlertId,
          0,
          Math.max(1, packet.hops + 1),
          Date.now()
        );
        const sosMsg = this.messages.get(ack.targetAlertId);
        if (sosMsg) {
          sosMsg.deliveryState = 'DELIVERED';
          sosMsg.relayedHops = Math.max(sosMsg.relayedHops, packet.hops + 1);
        }
      }

      if (packet.dst !== this.identity.nodeId) {
        await this.maybeRelayPacket(packet, fromPeerId, routeWithMe);
      }
    } catch {
      // Ignore malformed SOS_ACK
    }
  }

  private async handleSafePacket(
    packet: MeshPacket,
    fromPeerId: string,
    routeWithMe: string[]
  ): Promise<void> {
    this.relayPacketStore.set(packet.id, {
      ...packet,
      route: routeWithMe,
    });

    try {
      const safe = JSON.parse(
        bytesToUtf8(base64ToBytesSafe(packet.payload))
      ) as SafeCleartext;

      this.safetyChecks.set(packet.id, {
        ...safe,
        id: packet.id,
        senderId: packet.src,
        timestamp: packet.ts,
        hops: packet.hops + 1,
        route: routeWithMe,
      });
    } catch {
      // Ignore malformed SAFE
    }

    await this.maybeRelayPacket(packet, fromPeerId, routeWithMe);
  }

  private async handleHazardPacket(
    packet: MeshPacket,
    fromPeerId: string,
    routeWithMe: string[]
  ): Promise<void> {
    this.relayPacketStore.set(packet.id, {
      ...packet,
      route: routeWithMe,
    });

    try {
      const hazard = JSON.parse(
        bytesToUtf8(base64ToBytesSafe(packet.payload))
      ) as HazardCleartext;

      if (hazard.expiresAt > Date.now()) {
        this.hazards.set(packet.id, {
          id: packet.id,
          senderId: packet.src,
          senderName: hazard.senderName || `NODE-${packet.src.slice(0, 4)}`,
          category: hazard.category,
          title: hazard.title,
          description: hazard.description,
          lat: hazard.lat,
          lng: hazard.lng,
          timestamp: packet.ts,
          expiresAt: hazard.expiresAt,
          hops: packet.hops + 1,
          route: routeWithMe,
          signatureValid: true,
          packet: { ...packet, hops: packet.hops + 1, route: routeWithMe },
        });
      }
    } catch {
      // Ignore malformed HAZARD
    }

    await this.maybeRelayPacket(packet, fromPeerId, routeWithMe);
  }

  private async sendSignedAck(
    originalPacket: MeshPacket,
    ackKind: AckCleartext['ackKind'],
    recordedRoute: string[]
  ): Promise<void> {
    const ackCleartext: AckCleartext = {
      targetPacketId: originalPacket.id,
      ackKind,
      responderName: this.identity.displayName,
      recordedRoute,
    };

    const ackPacket = this.createSignedPacket({
      type: 'ACK',
      prio: 3,
      ttl: 8,
      dst: originalPacket.src,
      nonce: bytesToBase64(nacl.randomBytes(24)),
      payload: bytesToBase64(utf8ToBytes(JSON.stringify(ackCleartext))),
    });

    this.seenCache.markSeenAndRecordNeighbor(
      ackPacket.id,
      this.identity.nodeId
    );
    await this.dispatchPacket(ackPacket);
  }

  private async maybeRelayPacket(
    packet: MeshPacket,
    fromPeerId: string,
    routeWithMe: string[]
  ): Promise<void> {
    const nextTtl = packet.ttl - 1;
    if (nextTtl <= 0) {
      this.recordDrop(
        packet.id,
        fromPeerId,
        'ttl_expired',
        `Packet ${packet.id} reached TTL=0 after ${packet.hops + 1} hops`
      );
      return; // Drop at TTL 0
    }

    const mode = this.getEffectivePowerMode();
    if (
      !this.priorityQueue.canRelayUnderPowerPolicy(
        packet,
        mode,
        this.batteryPct
      )
    ) {
      this.recordDrop(
        packet.id,
        fromPeerId,
        'saver_policy',
        `Dropped P${packet.prio} transit packet under battery saver (${this.batteryPct}%)`
      );
      return; // Saver mode drops low-priority transit packets, keeps SOS/Emergency
    }

    const forwardedPacket: MeshPacket = {
      ...packet,
      ttl: nextTtl,
      hops: packet.hops + 1,
      route: routeWithMe,
    };

    // Store in relay buffer for anti-entropy sync when disconnected neighbors appear later
    this.relayPacketStore.set(forwardedPacket.id, forwardedPacket);

    // Enqueue into the 4-queue priority scheduler (P0=SOS, P1=Emergency, P2=Normal, P3=Info/ACK)
    const enqueued = this.priorityQueue.enqueue({
      packet: forwardedPacket,
      targetPeerId: 'ALL_EXCEPT_SENDER',
      excludePeerId: fromPeerId,
      enqueuedAt: Date.now(),
    });
    if (!enqueued) {
      return;
    }

    const drainNextFromPriorityScheduler = async () => {
      this.pendingRelayTimers.delete(forwardedPacket.id);
      const nextTask = this.priorityQueue.dequeue();
      if (!nextTask) return;

      // Counter-based broadcast suppression: if overheard from ≥ 2 neighbors, skip redundant flood
      if (
        this.seenCache.shouldSuppressForward(
          nextTask.packet.id,
          MESH_CONSTANTS.OVERHEAR_SUPPRESSION_THRESHOLD
        )
      ) {
        this.packetsSuppressedDuplicate += 1;
        return;
      }
      this.seenCache.markForwarded(nextTask.packet.id);
      this.packetsRelayed += 1;
      await this.dispatchPacket(nextTask.packet, nextTask.excludePeerId);
      this.notifyStateChange();
    };

    if (this.relayJitterMs <= 0) {
      await drainNextFromPriorityScheduler();
    } else {
      const minMs =
        forwardedPacket.prio === 0
          ? MESH_CONSTANTS.JITTER_SOS_MIN_MS
          : MESH_CONSTANTS.JITTER_NORMAL_MIN_MS;
      const maxMs =
        forwardedPacket.prio === 0
          ? MESH_CONSTANTS.JITTER_SOS_MAX_MS
          : Math.min(this.relayJitterMs, MESH_CONSTANTS.JITTER_NORMAL_MAX_MS);
      const jitter =
        minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1));

      const timer = setTimeout(() => {
        void drainNextFromPriorityScheduler();
      }, jitter);
      this.pendingRelayTimers.set(forwardedPacket.id, timer);
    }
  }

  /**
   * Executes due exponential-backoff retries (1s -> 30s cap) from the store-and-forward outbox.
   */
  public async tickOutboxRetries(now = Date.now()): Promise<number> {
    const due = this.outbox.getDueForRetry(now);
    let retried = 0;
    for (const pkt of due) {
      this.metricLogger.recordPacketRetry(pkt.prio);
      const sent = await this.dispatchPacket(pkt);
      retried += 1;
      if (sent) {
        const msg = this.messages.get(pkt.id);
        if (msg && msg.deliveryState === 'PENDING') {
          msg.deliveryState = 'SENT';
        }
      }
    }
    if (retried > 0) {
      this.notifyStateChange();
    }
    return retried;
  }

  private async flushOutboxToNewPeer(_peerId: string): Promise<void> {
    const buffered = this.outbox.getAllBufferedPackets();
    for (const pkt of buffered) {
      this.metricLogger.recordPacketRetry(pkt.prio);
      const sent = await this.dispatchPacket(pkt);
      if (sent) {
        const msg = this.messages.get(pkt.id);
        if (msg && msg.deliveryState === 'PENDING') {
          msg.deliveryState = 'SENT';
        }
      }
    }
  }

  /**
   * Dispatches a packet using direct-neighbor fast path if destination is a direct neighbor,
   * otherwise floods to all connected neighbors except `excludePeerId`.
   */
  private async dispatchPacket(
    packet: MeshPacket,
    excludePeerId?: string
  ): Promise<boolean> {
    const connectedNeighbors = this.transport.getPeers();
    if (connectedNeighbors.length === 0) {
      return false;
    }

    // Direct-neighbor fast path (§4): if destination is a direct neighbor, send directly first
    if (packet.dst !== 'BROADCAST') {
      const directTarget = connectedNeighbors.find(
        (n) => n.peerId === packet.dst && n.peerId !== excludePeerId
      );
      if (directTarget) {
        const ok = await this.sendPacketToPeer(directTarget.peerId, packet);
        if (ok) return true;
      }
    }

    let anySent = false;
    for (const neighbor of connectedNeighbors) {
      if (neighbor.peerId === excludePeerId) continue;
      if (neighbor.peerId === packet.src) continue;
      const ok = await this.sendPacketToPeer(neighbor.peerId, packet);
      if (ok) {
        anySent = true;
      }
    }
    return anySent;
  }

  private async transmitToNeighbors(
    packet: MeshPacket,
    excludePeerId?: string
  ): Promise<boolean> {
    return this.dispatchPacket(packet, excludePeerId);
  }

  private async sendPacketToPeer(
    peerId: string,
    packet: MeshPacket
  ): Promise<boolean> {
    const bytes = utf8ToBytes(JSON.stringify(packet));
    if (bytes.byteLength > MAX_PACKET_BYTES) {
      return false;
    }
    const ok = await this.transport.send(peerId, bytes);
    if (ok) {
      this.packetsSent += 1;
    }
    return ok;
  }
}

function base64ToBytesSafe(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
