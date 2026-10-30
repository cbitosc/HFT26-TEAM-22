/**
 * Global Zustand Store for Sanket Setu Mesh App (src/store/useMeshStore.ts)
 * Coordinates:
 * - Local user's cryptographic NodeIdentity & MeshEngine
 * - Virtual Multi-Node Simulator (`SimNetworkController` + virtual phones B, C, D)
 * - Verified Responder Certificates (`DEMO AUTHORITY`), Sealed Precise Location, Closed-Loop `SOS_ACK`
 * - Safety Check (`SAFE`) & Family/Group Circles, Signed `HAZARD` Reports, Setu Online Gateway (DEMO), and Last-Gasp SOS
 * - IndexedDB persistence via Dexie (`sanketDb`)
 */

import { create } from 'zustand';
import {
  HazardCategory,
  LocationPrecision,
  MeshActivityMetrics,
  OutboxEntry,
  PeerNode,
  PowerMode,
  PriorityLevel,
  SafetyCircle,
  SOSCategoryId,
  StoredHazardReport,
  StoredMessage,
  StoredSOSAlert,
} from '../mesh/types';
import {
  base64ToBytes,
  bytesToBase64,
  decryptSecretKeysWithVaultKey,
  derivePinKey,
  encryptIdentityWithPin,
  encryptSecretKeysWithVaultKey,
  generateNodeIdentity,
  mergeIdentityFromStorage,
  NodeIdentity,
  PublicIdentity,
  splitIdentityForStorage,
} from '../crypto/identity';
import { decodeTrustQrUri, encodeTrustQrUri } from '../crypto/qr';
import {
  decodeResponderCertQrUri,
  issueResponderCertificate,
  ResponderCertificate,
  verifyResponderCertificate,
} from '../crypto/responderCert';
import { Capacitor } from '@capacitor/core';
import {
  SimLinkState,
  SimLinkTransmissionEvent,
  SimNetworkController,
  SimNodePosition,
} from '../transport/SimTransport';
import {
  MeshPermissionState,
  NearbyMeshNative,
  NearbyTransport,
  type RadioDiagnostics,
} from '../transport/NearbyTransport';
import { alertIncoming } from '../lib/alertFeedback';
import { NullTransport } from '../transport/NullTransport';
import {
  buildDemoWorld,
  createSimTransport,
  crossRegisterDemoContacts,
  seedDemoTraffic,
  VirtualPeerInstance,
} from './demoRuntime';
import { Transport } from '../transport/Transport';
import { MeshEngine, PacketDropLogEntry } from '../mesh/engine';
import {
  CongestionBenchmarkSummary,
  MeshQualitySnapshot,
  summarizeLatencies,
} from '../mesh/metrics';
import { PersistedSeenRow } from '../mesh/seenCache';
import {
  getOrCreateLocalVaultKey,
  loadKvJson,
  loadUnexpiredSeenEntries,
  sanketDb,
  saveKvJson,
} from '../db/dexie';
import { DEFAULT_FEATHERLESS_MODEL } from '../ai/config';
import { getCurrentFix } from '../lib/location';
import { applyTheme, readInitialTheme, ThemeMode } from '../ui/theme';

export type { VirtualPeerInstance } from './demoRuntime';
export type AppMode = 'real' | 'demo';

export interface MeshStoreState {
  initialized: boolean;
  appMode: AppMode;
  /** Set when an SOS had to go out without the location the user asked for. */
  lastSosLocationNote: string | null;
  onboardingDone: boolean;
  identity: NodeIdentity;
  language: string;
  keyEncryptedWithPin: boolean;
  channelKeySecret: string;
  locationOptIn: LocationPrecision;
  simulatedLat: number;
  simulatedLng: number;

  // Responder Certificate & Gateway Setu State
  myResponderCert: ResponderCertificate | null;
  gatewayConsent: boolean;
  bridgedGatewayIds: string[];
  lastGaspTriggered: boolean;

  // AI Settings
  featherlessApiKey: string;
  featherlessModel: string;
  aiPrivacyAccepted: boolean;
  isOnline: boolean;

  // Runtime Permissions (native Android only; null until the first check runs)
  permissionState: MeshPermissionState | null;
  permissionGateDismissed: boolean;

  /** Count of peers currently connected over the real Nearby Connections radio (0 off native, or with no real peers in range). */
  realRadioPeerCount: number;

  // Startup progress, reported from real init steps (drives the splash status line)
  initStep: string;
  initReady: boolean;
  /** True when a PIN vault exists and has not been unlocked this session. */
  locked: boolean;
  pinEnabled: boolean;

  // UI preferences (persisted in the kv table)
  theme: ThemeMode;
  /** Opt-in Three.js orb. Default off: the CSS orb is used unless the user enables this. */
  visuals3D: boolean;
  darkSuggestionDismissed: boolean;

  // Live Mesh State
  peers: PeerNode[];
  messages: StoredMessage[];
  alerts: StoredSOSAlert[];
  hazards: StoredHazardReport[];
  circles: SafetyCircle[];
  outbox: OutboxEntry[];
  metrics: MeshActivityMetrics;
  meshQuality: MeshQualitySnapshot;
  dropLog: PacketDropLogEntry[];
  activeSosId: string | null;
  /** SOS id shown in the full-screen incoming-alert card, or null. */
  incomingAlertId: string | null;
  /** Alert ids the user has seen (opened Alerts or dismissed the card); drives the unread badge. */
  seenAlertIds: string[];

  // Selected conversation & Inspector state
  activeConversationId: string | null;
  inspectedMessageId: string | null;

  // Simulator State
  simNodes: SimNodePosition[];
  simLinks: SimLinkState[];
  simTransmissions: SimLinkTransmissionEvent[];
  simRadioRange: number;
  simLatencyMs: number;
  simPacketLossPct: number;

  // Actions
  initMeshApp: () => Promise<void>;
  completeOnboarding: (params: {
    displayName: string;
    pin?: string;
    language: string;
    powerMode: PowerMode;
    featherlessApiKey?: string;
  }) => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  setPowerMode: (mode: PowerMode) => void;
  setBatteryLevel: (pct: number, isCharging?: boolean) => void;
  setChannelKeySecret: (secret: string) => void;
  setLocationOptIn: (precision: LocationPrecision) => void;
  setFeatherlessConfig: (apiKey: string, model: string) => void;
  acceptAiPrivacyNotice: () => void;

  // Responder Enrollment & Gateway Setu Actions
  enrollAsVerifiedResponder: (
    role: ResponderCertificate['role'],
    organizationName: string
  ) => ResponderCertificate;
  enrollViaCertQrUri: (uri: string) => { ok: boolean; message: string };
  clearResponderCert: () => void;
  setGatewayConsent: (consent: boolean) => void;
  bridgeQueuedSosToSetuGateway: () => number;

  // Messaging & SOS Actions
  setActiveConversation: (peerId: string | null) => void;
  setInspectedMessage: (msgId: string | null) => void;
  sendDirectMessage: (
    recipientId: string,
    text: string,
    priority?: PriorityLevel
  ) => Promise<StoredMessage>;
  sendBroadcastMessage: (text: string, priority?: PriorityLevel) => Promise<StoredMessage>;
  broadcastSOS: (params: {
    category: SOSCategoryId;
    text: string;
    headcount: number;
    locationPrecision?: LocationPrecision;
    pictogramId?: string;
    isLastGasp?: boolean;
  }) => Promise<StoredSOSAlert>;
  cancelActiveSOS: () => void;
  dismissIncomingAlert: () => void;
  setLanguage: (language: string) => void;
  markAlertsSeen: () => void;
  respondToSOS: (
    alertId: string,
    mode: 'RELAY_RECEIPT' | 'SOS_RESPONDING',
    note?: string
  ) => Promise<void>;
  triggerVirtualResponderAck: (
    alertId: string,
    status: 'ACKNOWLEDGED' | 'RESPONDING',
    useVerifiedResponder: boolean
  ) => Promise<void>;
  verifyPeerViaQrUri: (uri: string) => { ok: boolean; message: string };
  getMyTrustQrUri: () => string;

  // Safety Check & Circles Actions
  createSafetyCircle: (name: string, secretKey: string) => SafetyCircle;
  sendImSafeToCircle: (
    circleId: string,
    status: 'SAFE' | 'NEEDS_ASSISTANCE',
    note: string
  ) => Promise<void>;
  simulatePeerSafeCheckIn: (
    peerNodeId: string,
    circleId: string,
    status: 'SAFE' | 'NEEDS_ASSISTANCE',
    note: string
  ) => Promise<void>;

  // Hazard Actions
  reportHazard: (params: {
    category: HazardCategory;
    title: string;
    description: string;
    lat?: number;
    lng?: number;
    ttlMinutes?: number;
  }) => Promise<StoredHazardReport>;

  // Simulator Controls
  setSimNodePosition: (nodeId: string, x: number, y: number) => void;
  setSimNodeOnline: (nodeId: string, online: boolean) => void;
  toggleSimLinkBlocked: (nodeA: string, nodeB: string) => void;
  setSimRadioRange: (range: number) => void;
  setSimLatencyMs: (ms: number) => void;
  setSimPacketLossPct: (pct: number) => void;
  addVirtualSimNode: () => Promise<void>;
  resetFourNodeChainPreset: () => Promise<void>;
  triggerRemoteSimMessage: (
    fromVirtualNodeId: string,
    toNodeId: string,
    text: string
  ) => Promise<void>;
  triggerRemoteSimSOS: (
    fromVirtualNodeId: string,
    category: SOSCategoryId,
    text: string
  ) => Promise<void>;
  runCongestionBenchmark: () => Promise<CongestionBenchmarkSummary | null>;
  clearAllLocalData: () => Promise<void>;

  /** Queries current OS permission grant state (no prompt). No-op off native Android. */
  checkMeshPermissions: () => Promise<void>;
  /** Triggers the OS runtime permission dialog(s). Show a rationale screen before calling this. */
  requestMeshPermissions: () => Promise<void>;
  /** Re-checks permissions and (re)starts advertising + discovery. Safe to call at any time. */
  ensureRadio: () => Promise<void>;
  /** Opens this app's system Settings page. */
  openAppSettings: () => Promise<void>;
  dismissPermissionGate: () => void;

  unlockWithPin: (pin: string) => Promise<boolean>;
  enablePin: (pin: string) => Promise<void>;
  setAppMode: (mode: AppMode) => Promise<void>;
  setTheme: (mode: ThemeMode) => void;
  setVisuals3D: (enabled: boolean) => void;
  dismissDarkSuggestion: () => void;
}

const REAL_CIRCLE_ID = 'circle-nearby';
const DEMO_CIRCLE_ID = 'circle-demo-family';
const simController = new SimNetworkController();
let localEngine: MeshEngine | null = null;
let nativeNearbyTransport: NearbyTransport | null = null;
const virtualInstances = new Map<string, VirtualPeerInstance>();

// --- UI update throttling -----------------------------------------------------------------
// The engine notifies after every packet and the simulator after every transmission; pushing
// each of those straight into React re-rendered every subscriber dozens of times per second.
// High-frequency sources go through these throttles (<= 4 UI updates/sec); explicit user
// actions still call syncStoreFromEngine directly so their result shows immediately.
const UI_SYNC_INTERVAL_MS = 250;
const TELEMETRY_INTERVAL_MS = 1000;
const SEEN_PERSIST_INTERVAL_MS = 1000;
const PERSIST_INTERVAL_MS = 1500;
let pendingPersistTimer: ReturnType<typeof setTimeout> | null = null;
let lastQualitySnapshotAt = 0;
let pendingSyncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTransmissions: SimLinkTransmissionEvent[] = [];
let pendingTransmissionTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSeenRows: PersistedSeenRow[] = [];
let pendingSeenTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced write of this node's own messages, SOS alerts and unacknowledged outbox to Dexie. */
function schedulePersistState(): void {
  if (pendingPersistTimer !== null) return;
  pendingPersistTimer = setTimeout(() => {
    pendingPersistTimer = null;
    const engine = localEngine;
    if (!engine) return;
    const me = engine.identity.nodeId;
    void (async () => {
      try {
        await sanketDb.messages.bulkPut(engine.getMessages().filter((m) => m.senderId === me));
        await sanketDb.alerts.bulkPut(engine.getAlerts().filter((a) => a.senderId === me));
        const entries = engine.outbox.getAllEntries();
        await sanketDb.outbox.clear();
        await sanketDb.outbox.bulkPut(entries);
      } catch {
        // IndexedDB unavailable — in-memory state still works.
      }
    })();
  }, PERSIST_INTERVAL_MS);
}

function shallowEqualRecord<T extends object>(a: T, b: T): boolean {
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function scheduleThrottledSync(
  set: (partial: Partial<MeshStoreState>) => void,
  get: () => MeshStoreState
): void {
  if (pendingSyncTimer !== null) return;
  pendingSyncTimer = setTimeout(() => {
    pendingSyncTimer = null;
    syncStoreFromEngine(set, get);
  }, UI_SYNC_INTERVAL_MS);
}

function queueSimTransmission(
  ev: SimLinkTransmissionEvent,
  set: (partial: Partial<MeshStoreState>) => void,
  get: () => MeshStoreState
): void {
  pendingTransmissions.unshift(ev);
  if (pendingTransmissionTimer !== null) return;
  pendingTransmissionTimer = setTimeout(() => {
    pendingTransmissionTimer = null;
    const merged = [...pendingTransmissions, ...get().simTransmissions].slice(0, 28);
    pendingTransmissions = [];
    set({ simTransmissions: merged });
  }, UI_SYNC_INTERVAL_MS);
}

/** Batches seen-cache rows into one Dexie bulkPut per second instead of one write per packet. */
function queueSeenPersist(row: PersistedSeenRow): void {
  pendingSeenRows.push(row);
  if (pendingSeenTimer !== null) return;
  pendingSeenTimer = setTimeout(() => {
    pendingSeenTimer = null;
    const rows = pendingSeenRows;
    pendingSeenRows = [];
    void sanketDb.seen.bulkPut(rows).catch(() => {
      // IndexedDB unavailable (private mode / tests) — the in-memory seen-cache still works.
    });
  }, SEEN_PERSIST_INTERVAL_MS);
}

/**
 * Persists a NodeIdentity split as public fields (plaintext) + secret keys (always
 * nacl.secretbox-encrypted under the device-local vault key). Never writes raw secret
 * keys to storage. See `crypto/identity.ts` for the threat model.
 */
// When the user sets a PIN, the vault key is derived from it and exists only in memory for the
// session (the random local key is deleted), so the secret keys at rest can't be opened without
// the PIN. Without a PIN we fall back to the device-local random key (see SECURITY.md).
let sessionVaultKeyB64: string | null = null;
let initListenersAttached = false;

async function currentVaultKey(): Promise<string> {
  return sessionVaultKeyB64 ?? (await getOrCreateLocalVaultKey());
}

function vaultKeyFromPin(pin: string, saltB64: string): string {
  return bytesToBase64(derivePinKey(pin, base64ToBytes(saltB64)));
}

async function persistIdentity(identity: NodeIdentity): Promise<void> {
  const vaultKeyB64 = await currentVaultKey();
  const { publicPart, secretPart } = splitIdentityForStorage(identity);
  const encryptedSecrets = encryptSecretKeysWithVaultKey(secretPart, vaultKeyB64);
  await saveKvJson('node_identity_public', publicPart);
  await saveKvJson('node_identity_secret_enc', encryptedSecrets);
}

/**
 * Loads a previously persisted identity, decrypting its secret keys with the device vault
 * key. Transparently migrates the legacy plaintext `node_identity` entry (pre-vault builds)
 * on first load, then deletes it.
 */
async function loadPersistedIdentity(): Promise<NodeIdentity | null> {
  const publicPart = await loadKvJson<PublicIdentity>('node_identity_public');
  const encryptedSecrets = await loadKvJson<ReturnType<
    typeof encryptSecretKeysWithVaultKey
  >>('node_identity_secret_enc');

  if (publicPart && encryptedSecrets) {
    const vaultKeyB64 = await currentVaultKey();
    const secretPart = decryptSecretKeysWithVaultKey(encryptedSecrets, vaultKeyB64);
    if (secretPart) {
      return mergeIdentityFromStorage(publicPart, secretPart);
    }
  }

  // Legacy migration: older builds stored the full identity (incl. secret keys) in
  // plaintext under `node_identity`. If present, split/encrypt it into the vault scheme
  // and remove the plaintext copy.
  const legacyIdentity = await loadKvJson<NodeIdentity>('node_identity');
  if (legacyIdentity) {
    await persistIdentity(legacyIdentity);
    try {
      await sanketDb.kv.delete('node_identity');
    } catch {
      // ignore
    }
    return legacyIdentity;
  }

  return null;
}

function buildUpdatedCircles(
  existingCircles: SafetyCircle[],
  userIdentity: NodeIdentity,
  peers: PeerNode[],
  safetyChecks: ReturnType<MeshEngine['getSafetyChecks']>,
  batteryPct: number,
  demo: boolean
): SafetyCircle[] {
  const baseCircles: SafetyCircle[] =
    existingCircles.length > 0
      ? existingCircles
      : !demo
        ? [
            {
              circleId: REAL_CIRCLE_ID,
              circleName: 'People nearby',
              circleKeyHint: '',
              createdAt: Date.now(),
              members: [],
            },
          ]
        : [
          {
            circleId: DEMO_CIRCLE_ID,
            circleName: 'Demo family circle',
            circleKeyHint: 'SHA256:9A4F·B21E',
            createdAt: Date.now() - 3600_000,
            members: [],
          },
          {
            circleId: 'circle-relief-team',
            circleName: 'Demo relief roster',
            circleKeyHint: 'SHA256:C308·77D1',
            createdAt: Date.now() - 1800_000,
            members: [],
          },
        ];

  return baseCircles.map((circle) => {
    const checksForCircle = safetyChecks.filter(
      (c) => c.circleId === circle.circleId
    );
    const latestBySender = new Map<
      string,
      (typeof checksForCircle)[number]
    >();
    for (const chk of checksForCircle) {
      const prev = latestBySender.get(chk.senderId);
      if (!prev || chk.timestamp > prev.timestamp) {
        latestBySender.set(chk.senderId, chk);
      }
    }

    const myCheck = latestBySender.get(userIdentity.nodeId);
    const members: SafetyCircle['members'] = [
      {
        nodeId: userIdentity.nodeId,
        displayName: `${userIdentity.displayName} (You)`,
        status: myCheck ? myCheck.status : 'UNKNOWN',
        lastCheckInTs: myCheck?.timestamp,
        note: myCheck?.note,
        hops: 0,
        batteryPct,
      },
      ...peers.map((p) => {
        const pCheck = latestBySender.get(p.nodeId);
        return {
          nodeId: p.nodeId,
          displayName: p.displayName,
          status: pCheck ? pCheck.status : ('UNKNOWN' as const),
          lastCheckInTs: pCheck?.timestamp,
          note: pCheck?.note,
          hops: pCheck ? pCheck.hops : p.hopsAway,
          batteryPct: pCheck?.batteryPct ?? p.batteryPct,
        };
      }),
    ];

    return {
      ...circle,
      members,
    };
  });
}

function syncStoreFromEngine(
  set: (partial: Partial<MeshStoreState>) => void,
  get: () => MeshStoreState
) {
  if (!localEngine) return;
  const peers = localEngine.getPeers();
  const safetyChecks = localEngine.getSafetyChecks();
  const metrics = localEngine.getActivityMetrics();
  const alerts = localEngine.getAlerts().map((a) => ({
    ...a,
    bridgedOnline: get().bridgedGatewayIds.includes(a.id),
  }));

  const circles = buildUpdatedCircles(
    get().circles,
    localEngine.identity,
    peers,
    safetyChecks,
    metrics.batteryPct,
    get().appMode === 'demo'
  );

  localEngine.metricLogger.recordPeerCount(
    peers.filter((p) => p.isDirectNeighbor).length
  );

  // Telemetry cards: recompute the (comparatively expensive) quality snapshot at most once per
  // second, and keep the previous object reference when nothing changed so selectors on
  // `metrics` / `meshQuality` don't re-render for identical values.
  if (get().appMode === 'real') schedulePersistState();
  const prev = get();
  const nextMetrics = shallowEqualRecord(prev.metrics, metrics) ? prev.metrics : metrics;
  const now = Date.now();
  let nextQuality = prev.meshQuality;
  if (now - lastQualitySnapshotAt >= TELEMETRY_INTERVAL_MS) {
    lastQualitySnapshotAt = now;
    const snapshot = localEngine.getMeshQualitySnapshot();
    if (JSON.stringify(snapshot) !== JSON.stringify(prev.meshQuality)) {
      nextQuality = snapshot;
    }
  }

  set({
    peers,
    messages: localEngine.getMessages(),
    alerts,
    hazards: localEngine.getHazards(),
    circles,
    outbox: localEngine.outbox.getAllEntries(),
    metrics: nextMetrics,
    meshQuality: nextQuality,
    dropLog: localEngine.getDropLog(),
    simNodes: simController.getNodes(),
    simLinks: simController.getAllLinks(),
    simRadioRange: simController.getRadioRange(),
    simLatencyMs: simController.getLatencyMs(),
    simPacketLossPct: simController.getPacketLossPct(),
    // Truthful "REAL RADIO" signal: at least one peer is currently connected over the actual
    // Nearby Connections transport, not just the always-present in-memory demo mesh. Checked
    // directly against NearbyTransport's own peer list rather than inferred, so this can never
    // claim real radio connectivity that isn't actually there.
    realRadioPeerCount: nativeNearbyTransport?.getPeers().length ?? 0,
  });
}

/** Live radio diagnostics for the Radio diagnostics screen (REAL mode only; null in DEMO). */
export async function getRadioDiagnostics(): Promise<
  (RadioDiagnostics & { outboxSize: number; lastDrop: PacketDropLogEntry | null }) | null
> {
  if (!nativeNearbyTransport || !localEngine) return null;
  const base = await nativeNearbyTransport.getDiagnostics();
  const drops = localEngine.getDropLog();
  return { ...base, outboxSize: localEngine.outbox.size(), lastDrop: drops[drops.length - 1] ?? null };
}

async function teardownMesh(): Promise<void> {
  for (const inst of virtualInstances.values()) {
    await inst.engine.stop();
    simController.unregisterNode(inst.identity.nodeId);
  }
  virtualInstances.clear();
  if (localEngine) {
    const me = localEngine.identity.nodeId;
    await localEngine.stop();
    simController.unregisterNode(me);
  }
  nativeNearbyTransport = null;
}

/**
 * Builds and starts the mesh for the chosen mode.
 * - REAL: the only transport is the Nearby radio (or NullTransport where there is no radio, e.g. the
 *   browser). No SimTransport, no virtual phones, no fixture traffic. Everything shown comes from
 *   real engine events plus this phone's own persisted state.
 * - DEMO: simulated phones and fixtures from ./demoRuntime. Nothing from DEMO is persisted.
 */
async function setupMesh(
  mode: AppMode,
  userIdentity: NodeIdentity,
  set: (partial: Partial<MeshStoreState>) => void,
  get: () => MeshStoreState
) {
  await teardownMesh();

  let transport: Transport;
  let virtuals: VirtualPeerInstance[] = [];
  if (mode === 'demo') {
    const world = buildDemoWorld(userIdentity, simController);
    transport = world.userTransport;
    virtuals = world.virtuals;
    console.info('[SanketMesh] Mode DEMO: SimTransport only (simulated phones).');
  } else if (Capacitor.isNativePlatform()) {
    nativeNearbyTransport = new NearbyTransport(userIdentity.nodeId, userIdentity.displayName);
    transport = nativeNearbyTransport;
    console.info('[SanketMesh] Mode REAL: NearbyTransport (real radio) only.');
  } else {
    transport = new NullTransport();
    console.info('[SanketMesh] Mode REAL on a device without a radio (browser): no transport, no peers.');
  }

  localEngine = new MeshEngine({
    identity: userIdentity,
    transport,
    responderCert: get().myResponderCert,
    relayJitterMs: 15,
    retryTickMs: 1000,
  });

  let restoredSosId: string | null = null;
  if (mode === 'real') {
    // One-time cleanup: earlier builds mixed simulated fixtures into the same tables.
    try {
      if (!(await loadKvJson<boolean>('real_mode_clean_v1'))) {
        await Promise.all([
          sanketDb.messages.clear(),
          sanketDb.alerts.clear(),
          sanketDb.outbox.clear(),
          sanketDb.seen.clear(),
        ]);
        await saveKvJson('real_mode_clean_v1', true);
      }
      const [msgs, alerts, outboxRows] = await Promise.all([
        sanketDb.messages.where('senderId').equals(userIdentity.nodeId).toArray(),
        sanketDb.alerts.where('senderId').equals(userIdentity.nodeId).toArray(),
        sanketDb.outbox.toArray(),
      ]);
      const mine = outboxRows.filter((e) => e.packet.src === userIdentity.nodeId);
      localEngine.restoreState({ messages: msgs, alerts, outbox: mine });
      const pendingSos = mine.find((e) => e.packet.type === 'SOS');
      restoredSosId = pendingSos ? pendingSos.packet.id : null;
    } catch {
      // IndexedDB unavailable (private mode): run without persistence.
    }
    const persistedSeen = await loadUnexpiredSeenEntries();
    localEngine.seenCache.hydrateFromStorage(persistedSeen);
    localEngine.seenCache.setPersistCallback((row) => {
      queueSeenPersist(row);
    });
  }

  for (const v of virtuals) virtualInstances.set(v.identity.nodeId, v);
  if (mode === 'demo') crossRegisterDemoContacts(localEngine, virtuals);

  localEngine.onStateChange(() => {
    scheduleThrottledSync(set, get);
  });
  localEngine.onIncomingAlert((alert) => {
    // Only a signed, verified, newly received SOS reaches here (the engine drops everything else).
    alertIncoming(alert);
    set({ incomingAlertId: alert.id });
    syncStoreFromEngine(set, get);
  });

  await localEngine.start();
  for (const v of virtuals) await v.engine.start();

  void nativeNearbyTransport?.setPowerMode(localEngine.getEffectivePowerMode());

  if (mode === 'demo') {
    simController.recomputeNeighborhoods();
    await seedDemoTraffic(userIdentity, virtuals);
  }

  const medic = virtuals[2];
  set({
    initialized: true,
    appMode: mode,
    activeSosId: restoredSosId,
    activeConversationId: mode === 'demo' ? (medic?.identity.nodeId ?? null) : 'BROADCAST',
    inspectedMessageId: mode === 'demo' ? (localEngine.getMessages()[0]?.id ?? null) : null,
    circles: [],
    bridgedGatewayIds: [],
    simTransmissions: [],
  });
  syncStoreFromEngine(set, get);
}

const initialIdentity = generateNodeIdentity('');

export const useMeshStore = create<MeshStoreState>((set, get) => ({
  initialized: false,
  appMode: Capacitor.isNativePlatform() ? 'real' : 'demo',
  lastSosLocationNote: null,
  onboardingDone: false,
  identity: initialIdentity,
  language: 'English',
  keyEncryptedWithPin: false,
  channelKeySecret: '',
  locationOptIn: 'precise',
  simulatedLat: 12.97159,
  simulatedLng: 77.59456,

  myResponderCert: null,
  gatewayConsent: true,
  bridgedGatewayIds: [],
  lastGaspTriggered: false,

  featherlessApiKey:
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_FEATHERLESS_API_KEY) ||
    '',
  featherlessModel: DEFAULT_FEATHERLESS_MODEL,
  aiPrivacyAccepted: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : false,

  permissionState: null,
  permissionGateDismissed: false,
  realRadioPeerCount: 0,

  initStep: 'Starting',
  initReady: false,
  locked: false,
  pinEnabled: false,
  theme: readInitialTheme(),
  visuals3D: false,
  darkSuggestionDismissed: false,

  peers: [],
  messages: [],
  alerts: [],
  hazards: [],
  circles: [],
  outbox: [],
  metrics: {
    powerMode: 'active',
    batteryPct: 88,
    isCharging: false,
    scanDutyCyclePct: 100,
    scanWindowMs: 30000,
    sleepWindowMs: 0,
    packetsSent: 0,
    packetsReceived: 0,
    packetsRelayed: 0,
    packetsDroppedInvalidSig: 0,
    packetsSuppressedDuplicate: 0,
    syncInventoriesExchanged: 0,
  },
  meshQuality: {
    byPriority: {
      0: {
        priority: 0,
        label: 'P0 · SOS Beacon',
        sentCount: 0,
        deliveredCount: 0,
        deliveryRatioPct: 100,
        meanLatencyMs: 0,
        jitterStdDevMs: 0,
        lastLatencyMs: null,
        avgHops: 0,
        retries: 0,
        retryRate: 0,
      },
      1: {
        priority: 1,
        label: 'P1 · Emergency / Safe / Hazard',
        sentCount: 0,
        deliveredCount: 0,
        deliveryRatioPct: 100,
        meanLatencyMs: 0,
        jitterStdDevMs: 0,
        lastLatencyMs: null,
        avgHops: 0,
        retries: 0,
        retryRate: 0,
      },
      2: {
        priority: 2,
        label: 'P2 · Normal Direct Chat',
        sentCount: 0,
        deliveredCount: 0,
        deliveryRatioPct: 100,
        meanLatencyMs: 0,
        jitterStdDevMs: 0,
        lastLatencyMs: null,
        avgHops: 0,
        retries: 0,
        retryRate: 0,
      },
      3: {
        priority: 3,
        label: 'P3 · Info / ACK / Sync',
        sentCount: 0,
        deliveredCount: 0,
        deliveryRatioPct: 100,
        meanLatencyMs: 0,
        jitterStdDevMs: 0,
        lastLatencyMs: null,
        avgHops: 0,
        retries: 0,
        retryRate: 0,
      },
    },
    dropCounts: {
      replay_window: 0,
      seen_duplicate: 0,
      invalid_signature: 0,
      rate_limited: 0,
      ttl_expired: 0,
      saver_policy: 0,
      oversized: 0,
      malformed: 0,
      decrypt_failed: 0,
    },
    packetsRelayed: 0,
    packetsSuppressedDuplicate: 0,
    scanDutyCyclePct: 100,
    peerSeries: [],
    queueSizesByPriority: { 0: 0, 1: 0, 2: 0, 3: 0 },
    lastBenchmark: null,
  },
  dropLog: [],
  activeSosId: null,
  incomingAlertId: null,
  seenAlertIds: [],

  activeConversationId: null,
  inspectedMessageId: null,

  simNodes: [],
  simLinks: [],
  simTransmissions: [],
  simRadioRange: 290,
  simLatencyMs: 35,
  simPacketLossPct: 0,

  initMeshApp: async () => {
    if (get().initialized) return;

    if (!initListenersAttached) {
    initListenersAttached = true;
    // Listen to browser online/offline transitions
    if (typeof window !== 'undefined') {
      const updateOnline = () => set({ isOnline: navigator.onLine });
      window.addEventListener('online', updateOnline);
      window.addEventListener('offline', updateOnline);
    }

    if (Capacitor.isNativePlatform()) {
      void get().checkMeshPermissions();
      if (typeof document !== 'undefined') {
        // Coming back to the app (e.g. after the user switched Bluetooth on or granted a permission
        // in system settings) must re-check permissions and restart the radio if it is not running.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void get().ensureRadio();
        });
      }
      try {
        await NearbyMeshNative.addListener('permissionState', (state) => {
          set({ permissionState: state });
        });
      } catch {
        // ignore
      }
    }

    simController.onTransmission((ev) => {
      queueSimTransmission(ev, set, get);
    });

    simController.onTopologyChange(() => {
      scheduleThrottledSync(set, get);
    });
    }

    set({ initStep: 'Unlocking keys' });
    const pinSalt = await loadKvJson<string>('pin_vault_salt');
    if (pinSalt && sessionVaultKeyB64 === null) {
      // A PIN vault exists: stop here until the user unlocks it (App shows the PIN screen).
      set({ locked: true, pinEnabled: true, initReady: true, initStep: 'Locked' });
      return;
    }
    set({ pinEnabled: Boolean(pinSalt), locked: false });

    set({ initStep: 'Opening local store' });
    const savedIdentity = await loadPersistedIdentity();
    const savedOnboarding = await loadKvJson<boolean>('onboarding_done');
    const savedAiKey = await loadKvJson<string>('featherless_api_key');
    const savedAiModel = await loadKvJson<string>('featherless_model');
    const savedCert = await loadKvJson<ResponderCertificate>('responder_cert');
    const savedMode = await loadKvJson<AppMode>('app_mode');
    const savedLanguage = await loadKvJson<string>('ui_language');
    if (savedLanguage) set({ language: savedLanguage });
    set({ appMode: savedMode === 'real' || savedMode === 'demo' ? savedMode : get().appMode });
    const savedTheme = await loadKvJson<ThemeMode>('ui_theme');
    const savedVisuals3D = await loadKvJson<boolean>('ui_visuals_3d');
    const savedDarkDismissed = await loadKvJson<boolean>('ui_dark_suggestion_dismissed');
    // No kv entry yet (first launch, or storage was cleared): keep the pre-paint choice.
    const theme: ThemeMode =
      savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : get().theme;
    applyTheme(theme);
    set({
      theme,
      visuals3D: savedVisuals3D === true,
      darkSuggestionDismissed: savedDarkDismissed === true,
    });

    const activeIdentity = savedIdentity ?? get().identity;
    if (!savedIdentity) {
      await persistIdentity(activeIdentity);
    }

    set({
      identity: activeIdentity,
      onboardingDone: Boolean(savedOnboarding),
      featherlessApiKey: savedAiKey ?? get().featherlessApiKey,
      featherlessModel: savedAiModel ?? DEFAULT_FEATHERLESS_MODEL,
      myResponderCert: savedCert ?? null,
    });

    set({ initStep: 'Starting radio' });
    try {
      await setupMesh(get().appMode, activeIdentity, set, get);
    } finally {
      set({ initReady: true, initStep: 'Ready' });
    }
  },

  unlockWithPin: async (pin: string) => {
    const salt = await loadKvJson<string>('pin_vault_salt');
    const enc = await loadKvJson<ReturnType<typeof encryptSecretKeysWithVaultKey>>('node_identity_secret_enc');
    if (!salt || !enc) return false;
    const key = vaultKeyFromPin(pin.trim(), salt);
    if (!decryptSecretKeysWithVaultKey(enc, key)) return false;
    sessionVaultKeyB64 = key;
    set({ locked: false, initReady: false });
    await get().initMeshApp();
    return true;
  },

  enablePin: async (pin: string) => {
    const clean = pin.trim();
    if (clean.length < 4) throw new Error('PIN must be at least 4 characters');
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    sessionVaultKeyB64 = vaultKeyFromPin(clean, salt);
    await persistIdentity(get().identity); // re-encrypt the secrets under the PIN-derived key
    await saveKvJson('pin_vault_salt', salt);
    try {
      await sanketDb.kv.delete('local_vault_key_b64'); // the random key must not sit beside the ciphertext
    } catch {
      // ignore
    }
    set({ pinEnabled: true, keyEncryptedWithPin: true });
  },

  completeOnboarding: async ({
    displayName,
    pin,
    language,
    powerMode,
    featherlessApiKey,
  }) => {
    const cleanName = displayName.trim() || `Phone ${get().identity.nodeId.slice(0, 4)}`;
    const updatedIdentity: NodeIdentity = {
      ...get().identity,
      displayName: cleanName,
    };

    await persistIdentity(updatedIdentity);
    await saveKvJson('onboarding_done', true);

    let pinEncrypted = get().pinEnabled;
    if (pin && pin.trim().length >= 4) {
      await get().enablePin(pin);
      pinEncrypted = true;
    }

    if (featherlessApiKey !== undefined) {
      await saveKvJson('featherless_api_key', featherlessApiKey.trim());
    }

    if (localEngine) {
      localEngine.identity.displayName = cleanName;
      localEngine.setPowerPreference(powerMode);
      nativeNearbyTransport?.setDisplayName(cleanName);
      await localEngine.broadcastHello();
    }

    set({
      onboardingDone: true,
      identity: updatedIdentity,
      language,
      keyEncryptedWithPin: pinEncrypted,
      featherlessApiKey:
        featherlessApiKey !== undefined
          ? featherlessApiKey.trim()
          : get().featherlessApiKey,
    });
    syncStoreFromEngine(set, get);
  },

  setDisplayName: async (name: string) => {
    const clean = name.trim() || get().identity.displayName;
    const updated: NodeIdentity = { ...get().identity, displayName: clean };
    await persistIdentity(updated);
    if (localEngine) {
      localEngine.identity.displayName = clean;
      nativeNearbyTransport?.setDisplayName(clean);
      await localEngine.broadcastHello();
    }
    set({ identity: updated });
    syncStoreFromEngine(set, get);
  },

  setPowerMode: (mode: PowerMode) => {
    localEngine?.setPowerPreference(mode);
    void nativeNearbyTransport?.setPowerMode(mode);
    syncStoreFromEngine(set, get);
  },

  setBatteryLevel: (pct: number, isCharging = false) => {
    localEngine?.setBatteryState(pct, isCharging);
    // Last-Gasp SOS (§9.9): at ≤ 5% battery, automatically broadcast a final compact signed SOS with last coarse location and battery %
    if (pct <= 5 && !isCharging && !get().lastGaspTriggered && localEngine) {
      set({ lastGaspTriggered: true });
      localEngine.setPowerPreference('saver');
      const demo = get().appMode === 'demo';
      void (demo ? Promise.resolve(null) : getCurrentFix(3000))
        .then((fix) => {
          const lat = demo ? get().simulatedLat : fix?.lat;
          const lng = demo ? get().simulatedLng : fix?.lng;
          return localEngine!.broadcastSOS({
            category: 'other',
            text: `[LAST-GASP BEACON · ${pct}% BATTERY] Device entering emergency power-down.${lat !== undefined ? ' Last known approximate position attached.' : ''}`,
            headcount: 1,
            locationPrecision: lat !== undefined ? 'coarse' : 'disabled',
            lat,
            lng,
            accuracyMeters: fix?.accuracyMeters,
            isLastGasp: true,
          });
        })
        .then((alert) => {
          set({ activeSosId: alert.id });
          syncStoreFromEngine(set, get);
        });
    } else if (pct > 10 && get().lastGaspTriggered) {
      set({ lastGaspTriggered: false });
    }
    syncStoreFromEngine(set, get);
  },

  setChannelKeySecret: (secret: string) => {
    localEngine?.setChannelKeySecret(secret);
    for (const v of virtualInstances.values()) {
      v.engine.setChannelKeySecret(secret);
    }
    set({ channelKeySecret: secret });
  },

  setLocationOptIn: (precision: LocationPrecision) => {
    set({ locationOptIn: precision });
  },

  setFeatherlessConfig: (apiKey: string, model: string) => {
    void saveKvJson('featherless_api_key', apiKey.trim());
    void saveKvJson('featherless_model', model.trim());
    set({
      featherlessApiKey: apiKey.trim(),
      featherlessModel: model.trim() || DEFAULT_FEATHERLESS_MODEL,
    });
  },

  acceptAiPrivacyNotice: () => {
    set({ aiPrivacyAccepted: true });
  },

  enrollAsVerifiedResponder: (role, organizationName) => {
    const id = get().identity;
    const cert = issueResponderCertificate({
      subjectNodeId: id.nodeId,
      subjectSignPubB64: id.signPublicKeyB64,
      subjectDisplayName: id.displayName,
      role,
      organizationName:
        organizationName.trim() || 'NDRF / Civil Defense (DEMO AUTHORITY)',
    });
    void saveKvJson('responder_cert', cert);
    localEngine?.setResponderCertificate(cert);
    set({ myResponderCert: cert });
    syncStoreFromEngine(set, get);
    return cert;
  },

  enrollViaCertQrUri: (uri: string) => {
    const decoded = decodeResponderCertQrUri(uri);
    if (!decoded) {
      return {
        ok: false,
        message: 'Invalid Sanket Responder Certificate QR URI.',
      };
    }
    const id = get().identity;
    const verification = verifyResponderCertificate(decoded, id.nodeId);
    if (!verification.valid) {
      return {
        ok: false,
        message: `Certificate verification failed: ${verification.reason}`,
      };
    }
    void saveKvJson('responder_cert', decoded);
    localEngine?.setResponderCertificate(decoded);
    set({ myResponderCert: decoded });
    syncStoreFromEngine(set, get);
    return {
      ok: true,
      message: `Enrolled as Verified Responder (${decoded.role} · ${decoded.organizationName}). Sealed precise SOS coordinates are now unlocked.`,
    };
  },

  clearResponderCert: () => {
    void saveKvJson('responder_cert', null);
    localEngine?.setResponderCertificate(null);
    set({ myResponderCert: null });
    syncStoreFromEngine(set, get);
  },

  setGatewayConsent: (consent: boolean) => {
    set({ gatewayConsent: consent });
  },

  bridgeQueuedSosToSetuGateway: () => {
    if (!get().gatewayConsent) return 0;
    const currentAlerts = localEngine?.getAlerts() ?? [];
    const ids = currentAlerts.map((a) => a.id);
    set({ bridgedGatewayIds: ids });
    syncStoreFromEngine(set, get);
    return ids.length;
  },

  setActiveConversation: (peerId) => {
    set({ activeConversationId: peerId });
  },

  setInspectedMessage: (msgId) => {
    set({ inspectedMessageId: msgId });
  },

  sendDirectMessage: async (recipientId, text, priority = 2) => {
    if (!localEngine) {
      throw new Error('Mesh engine not initialized');
    }
    const msg = await localEngine.sendDirectMessage(recipientId, text, priority);
    try {
      await sanketDb.messages.put(msg);
    } catch {
      // ignore if IndexedDB unavailable
    }
    set({ inspectedMessageId: msg.id });
    syncStoreFromEngine(set, get);
    return msg;
  },

  sendBroadcastMessage: async (text, priority = 2) => {
    if (!localEngine) {
      throw new Error('Mesh engine not initialized');
    }
    const msg = await localEngine.sendBroadcastMessage(text, priority);
    try {
      await sanketDb.messages.put(msg);
    } catch {
      // ignore if IndexedDB unavailable
    }
    syncStoreFromEngine(set, get);
    return msg;
  },

  broadcastSOS: async ({
    category,
    text,
    headcount,
    locationPrecision,
    pictogramId,
    isLastGasp,
  }) => {
    if (!localEngine) {
      throw new Error('Mesh engine not initialized');
    }
    let precision = locationPrecision ?? get().locationOptIn;
    let lat: number | undefined;
    let lng: number | undefined;
    let accuracyMeters: number | undefined;
    let locationNote: string | null = null;
    if (precision !== 'disabled') {
      if (get().appMode === 'demo') {
        lat = get().simulatedLat;
        lng = get().simulatedLng;
      } else {
        // REAL mode: only a real GPS fix is ever attached; otherwise send without a location.
        const fix = await getCurrentFix();
        if (fix) {
          lat = fix.lat;
          lng = fix.lng;
          accuracyMeters = fix.accuracyMeters;
        } else {
          precision = 'disabled';
          locationNote = 'Location was not available, so the SOS was sent without it.';
        }
      }
    }
    set({ lastSosLocationNote: locationNote });
    const alert = await localEngine.broadcastSOS({
      category,
      text,
      headcount,
      locationPrecision: precision,
      lat,
      lng,
      accuracyMeters,
      pictogramId,
      isLastGasp,
    });
    try {
      await sanketDb.alerts.put(alert);
    } catch {
      // ignore
    }
    set({ activeSosId: alert.id, inspectedMessageId: alert.id });
    syncStoreFromEngine(set, get);
    return alert;
  },

  setLanguage: (language) => {
    set({ language });
    void saveKvJson('ui_language', language);
  },

  dismissIncomingAlert: () => {
    const id = get().incomingAlertId;
    if (!id) return;
    set({ incomingAlertId: null, seenAlertIds: [...get().seenAlertIds, id] });
  },

  markAlertsSeen: () => {
    const seen = new Set(get().seenAlertIds);
    let changed = false;
    for (const a of get().alerts) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        changed = true;
      }
    }
    if (changed) set({ seenAlertIds: [...seen] });
  },

  cancelActiveSOS: () => {
    const activeId = get().activeSosId;
    if (activeId && localEngine) {
      localEngine.outbox.remove(activeId);
    }
    set({ activeSosId: null });
    syncStoreFromEngine(set, get);
  },

  respondToSOS: async (alertId, mode, note) => {
    if (!localEngine) return;
    await localEngine.respondToSOSAlert(alertId, mode, note);
    syncStoreFromEngine(set, get);
  },

  triggerVirtualResponderAck: async (
    alertId,
    status,
    useVerifiedResponder
  ) => {
    const virtuals = Array.from(virtualInstances.values());
    const responderInst = useVerifiedResponder
      ? virtuals.find((v) =>
          v.identity.displayName.startsWith('MEDIC-D')
        ) ?? virtuals[virtuals.length - 1]
      : virtuals.find((v) =>
          v.identity.displayName.startsWith('RELAY-B')
        ) ?? virtuals[0];

    if (!responderInst) return;
    await responderInst.engine.sendSosAck(
      alertId,
      status,
      useVerifiedResponder
        ? status === 'RESPONDING'
          ? 'Verified NDRF Medic Team en route with trauma kit & unsealed GPS coordinates.'
          : 'Verified Field Base D received SOS beacon. Triaging now.'
        : 'Unverified civilian volunteer node acknowledged SOS.'
    );
    syncStoreFromEngine(set, get);
  },

  verifyPeerViaQrUri: (uri: string) => {
    if (!localEngine) {
      return { ok: false, message: 'Mesh engine not ready' };
    }
    const parsed = decodeTrustQrUri(uri);
    if (!parsed) {
      return {
        ok: false,
        message: 'Invalid Sanket QR URI or mismatched Ed25519 key fingerprint.',
      };
    }
    const peer = localEngine.registerContactPublicKey(
      parsed.nodeId,
      parsed.displayName,
      parsed.signPub,
      parsed.boxPub,
      true
    );
    if (parsed.safeCircleKey) {
      get().setChannelKeySecret(parsed.safeCircleKey);
    }
    syncStoreFromEngine(set, get);
    return {
      ok: true,
      message: `Verified ${peer.displayName} (${peer.nodeId}) — status: ${peer.trustStatus.toUpperCase()}`,
    };
  },

  getMyTrustQrUri: () => {
    const id = get().identity;
    return encodeTrustQrUri({
      nodeId: id.nodeId,
      displayName: id.displayName,
      signPub: id.signPublicKeyB64,
      boxPub: id.boxPublicKeyB64,
      safeCircleKey: get().channelKeySecret || undefined,
    });
  },

  createSafetyCircle: (name: string, secretKey: string) => {
    const cleanName = name.trim() || 'Emergency Family Circle';
    const circleId = `circle-${Date.now().toString(36)}`;
    const newCircle: SafetyCircle = {
      circleId,
      circleName: cleanName,
      circleKeyHint: `SHA256:${secretKey.slice(0, 4).toUpperCase() || 'A1F9'}·88C2`,
      createdAt: Date.now(),
      members: [],
    };
    set({ circles: [...get().circles, newCircle] });
    syncStoreFromEngine(set, get);
    return newCircle;
  },

  sendImSafeToCircle: async (circleId, status, note) => {
    if (!localEngine) return;
    const circle =
      get().circles.find((c) => c.circleId === circleId) ?? get().circles[0];
    await localEngine.broadcastSafetyCheck({
      circleId: circle?.circleId ?? REAL_CIRCLE_ID,
      circleName: circle?.circleName ?? 'Home & Family Circle (Ward 14)',
      status,
      note:
        note.trim() ||
        (status === 'SAFE'
          ? "I'm safe at current location. Power & water stable."
          : 'Need assistance / supplies at current shelter.'),
    });
    syncStoreFromEngine(set, get);
  },

  simulatePeerSafeCheckIn: async (peerNodeId, circleId, status, note) => {
    const inst = virtualInstances.get(peerNodeId);
    const circle =
      get().circles.find((c) => c.circleId === circleId) ?? get().circles[0];
    if (!inst) return;
    await inst.engine.broadcastSafetyCheck({
      circleId: circle?.circleId ?? REAL_CIRCLE_ID,
      circleName: circle?.circleName ?? 'Home & Family Circle (Ward 14)',
      status,
      note,
    });
    syncStoreFromEngine(set, get);
  },

  reportHazard: async ({
    category,
    title,
    description,
    lat,
    lng,
    ttlMinutes,
  }) => {
    if (!localEngine) {
      throw new Error('Mesh engine not initialized');
    }
    let hazardLat = lat;
    let hazardLng = lng;
    if (hazardLat === undefined || hazardLng === undefined) {
      if (get().appMode === 'demo') {
        hazardLat = get().simulatedLat + 0.002;
        hazardLng = get().simulatedLng - 0.0015;
      } else {
        const fix = await getCurrentFix();
        if (!fix) {
          throw new Error('Your location is not available, so the hazard cannot be placed on the map. Allow location and try again.');
        }
        hazardLat = fix.lat;
        hazardLng = fix.lng;
      }
    }
    const report = await localEngine.broadcastHazardReport({
      category,
      title,
      description,
      lat: hazardLat,
      lng: hazardLng,
      ttlMinutes: ttlMinutes ?? 120,
    });
    syncStoreFromEngine(set, get);
    return report;
  },

  setSimNodePosition: (nodeId, x, y) => {
    simController.setNodePosition(nodeId, x, y);
    syncStoreFromEngine(set, get);
  },

  setSimNodeOnline: (nodeId, online) => {
    simController.setNodeOnline(nodeId, online);
    syncStoreFromEngine(set, get);
  },

  toggleSimLinkBlocked: (nodeA, nodeB) => {
    const currentlyBlocked = simController.isLinkBlocked(nodeA, nodeB);
    simController.setLinkBlocked(nodeA, nodeB, !currentlyBlocked);
    syncStoreFromEngine(set, get);
  },

  setSimRadioRange: (range) => {
    simController.setRadioRange(range);
    syncStoreFromEngine(set, get);
  },

  setSimLatencyMs: (ms) => {
    simController.setLatencyMs(ms);
    syncStoreFromEngine(set, get);
  },

  setSimPacketLossPct: (pct) => {
    simController.setPacketLossPct(pct);
    syncStoreFromEngine(set, get);
  },

  addVirtualSimNode: async () => {
    const idx = virtualInstances.size + 2;
    const callsign = `NODE-${String.fromCharCode(64 + idx)} (Field-${idx})`;
    const vId = generateNodeIdentity(callsign);
    const x = 220 + ((idx * 170) % 580);
    const y = 140 + ((idx * 130) % 340);
    const vTransport = createSimTransport(
      vId.nodeId,
      vId.displayName,
      simController,
      x,
      y
    );
    const vEngine = new MeshEngine({
      identity: vId,
      transport: vTransport,
      channelKeySecret: get().channelKeySecret || undefined,
      relayJitterMs: 15,
    });

    virtualInstances.set(vId.nodeId, {
      identity: vId,
      transport: vTransport,
      engine: vEngine,
    });

    // Register keys with localEngine and other virtual nodes
    if (localEngine) {
      localEngine.registerContactPublicKey(
        vId.nodeId,
        vId.displayName,
        vId.signPublicKeyB64,
        vId.boxPublicKeyB64,
        false
      );
      vEngine.registerContactPublicKey(
        localEngine.identity.nodeId,
        localEngine.identity.displayName,
        localEngine.identity.signPublicKeyB64,
        localEngine.identity.boxPublicKeyB64,
        false
      );
    }
    for (const other of virtualInstances.values()) {
      if (other.identity.nodeId === vId.nodeId) continue;
      other.engine.registerContactPublicKey(
        vId.nodeId,
        vId.displayName,
        vId.signPublicKeyB64,
        vId.boxPublicKeyB64,
        false
      );
      vEngine.registerContactPublicKey(
        other.identity.nodeId,
        other.identity.displayName,
        other.identity.signPublicKeyB64,
        other.identity.boxPublicKeyB64,
        false
      );
    }

    await vEngine.start();
    simController.recomputeNeighborhoods();
    syncStoreFromEngine(set, get);
  },

  resetFourNodeChainPreset: async () => {
    await setupMesh('demo', get().identity, set, get);
  },

  triggerRemoteSimMessage: async (fromVirtualNodeId, toNodeId, text) => {
    if (fromVirtualNodeId === get().identity.nodeId) {
      await get().sendDirectMessage(toNodeId, text, 2);
      return;
    }
    const inst = virtualInstances.get(fromVirtualNodeId);
    if (!inst) return;
    await inst.engine.sendDirectMessage(toNodeId, text, 2);
    syncStoreFromEngine(set, get);
  },

  triggerRemoteSimSOS: async (fromVirtualNodeId, category, text) => {
    if (fromVirtualNodeId === get().identity.nodeId) {
      await get().broadcastSOS({ category, text, headcount: 2 });
      return;
    }
    const inst = virtualInstances.get(fromVirtualNodeId);
    if (!inst) return;
    await inst.engine.broadcastSOS({
      category,
      text,
      headcount: 2,
      locationPrecision: 'precise',
      lat: 12.98142,
      lng: 77.60318,
    });
    syncStoreFromEngine(set, get);
  },

  runCongestionBenchmark: async () => {
    if (!localEngine) return null;
    const virtuals = Array.from(virtualInstances.values());
    const dest =
      virtuals.find((v) => v.identity.displayName.startsWith('MEDIC-D')) ??
      virtuals[virtuals.length - 1];
    if (!dest) return null;

    // Same 3-hop path for both classes (A -> B -> C -> D). Latency = time from send until the
    // packet is present at the destination node's engine, polled every 2 ms. Nothing is estimated:
    // a packet that has not arrived by the timeout is counted as not arrived and left out.
    const FLOOD = 12;
    const SOS_COUNT = 3;
    const TIMEOUT_MS = 4000;
    const sentAt = new Map<string, number>();
    const sosIds = new Set<string>();
    const normalIds = new Set<string>();

    const sendNormal = async (i: number) => {
      const t0 = performance.now();
      const m = await localEngine!.sendDirectMessage(
        dest.identity.nodeId,
        `[BENCHMARK P2 #${i}] background traffic`,
        2
      );
      sentAt.set(m.id, t0);
      normalIds.add(m.id);
    };
    const sendSos = async () => {
      const t0 = performance.now();
      const a = await localEngine!.broadcastSOS({
        category: 'medical',
        text: '[BENCHMARK P0 SOS] priority test beacon',
        headcount: 1,
        locationPrecision: 'disabled',
      });
      sentAt.set(a.id, t0);
      sosIds.add(a.id);
    };

    // Flood first, then interleave the SOS beacons into the saturated channel.
    const sends: Promise<void>[] = [];
    for (let i = 1; i <= FLOOD; i++) sends.push(sendNormal(i));
    for (let i = 0; i < SOS_COUNT; i++) sends.push(sendSos());
    await Promise.all(sends);

    const arrivedAt = new Map<string, number>();
    const deadline = performance.now() + TIMEOUT_MS;
    while (performance.now() < deadline && arrivedAt.size < sentAt.size) {
      const now = performance.now();
      for (const m of dest.engine.getMessages()) {
        if (normalIds.has(m.id) && !arrivedAt.has(m.id)) arrivedAt.set(m.id, now);
      }
      for (const a of dest.engine.getAlerts()) {
        if (sosIds.has(a.id) && !arrivedAt.has(a.id)) arrivedAt.set(a.id, now);
      }
      await new Promise((r) => setTimeout(r, 2));
    }

    const latencies = (ids: Set<string>) =>
      [...ids]
        .filter((id) => arrivedAt.has(id))
        .map((id) => Math.round(arrivedAt.get(id)! - sentAt.get(id)!));

    const summary: CongestionBenchmarkSummary = {
      ranAtTs: Date.now(),
      sos: summarizeLatencies(sosIds.size, latencies(sosIds)),
      normal: summarizeLatencies(normalIds.size, latencies(normalIds)),
    };

    localEngine.metricLogger.setBenchmarkSummary(summary);
    syncStoreFromEngine(set, get);
    return summary;
  },


  clearAllLocalData: async () => {
    try {
      await sanketDb.messages.clear();
      await sanketDb.alerts.clear();
      await sanketDb.outbox.clear();
      await sanketDb.peers.clear();
      await sanketDb.seen.clear();
    } catch {
      // ignore
    }
    const freshId = generateNodeIdentity('');
    await persistIdentity(freshId);
    set({
      identity: freshId,
      activeSosId: null,
      myResponderCert: null,
      bridgedGatewayIds: [],
    });
    await setupMesh(get().appMode, freshId, set, get);
  },

  checkMeshPermissions: async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const state = await NearbyMeshNative.checkMeshPermissions();
      set({ permissionState: state });
    } catch {
      // Plugin not available (shouldn't happen on native, but never block the app over this).
    }
  },

  requestMeshPermissions: async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const state = await NearbyMeshNative.requestMeshPermissions();
      set({ permissionState: state });
      if (state.allGranted) {
        // The initial NearbyTransport.start() call may have no-op'd internally if permissions
        // weren't granted yet (the native plugin now rejects startAdvertising/startDiscovery
        // without them) — retry now that they are.
        await nativeNearbyTransport?.startRadio();
      }
    } catch {
      // ignore
    }
  },

  ensureRadio: async () => {
    if (!Capacitor.isNativePlatform() || !nativeNearbyTransport) return;
    await get().checkMeshPermissions();
    if (get().permissionState?.allGranted === false) return;
    if (!nativeNearbyTransport.isRadioRunning()) {
      await nativeNearbyTransport.startRadio();
    }
    syncStoreFromEngine(set, get);
  },

  openAppSettings: async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await NearbyMeshNative.openAppSettings();
    } catch {
      // ignore
    }
  },

  dismissPermissionGate: () => set({ permissionGateDismissed: true }),

  setAppMode: async (mode: AppMode) => {
    if (mode === get().appMode && get().initialized) return;
    await saveKvJson('app_mode', mode);
    set({ appMode: mode, activeSosId: null });
    await setupMesh(mode, get().identity, set, get);
  },

  setTheme: (mode: ThemeMode) => {
    applyTheme(mode);
    set({ theme: mode });
    void saveKvJson('ui_theme', mode);
  },

  setVisuals3D: (enabled: boolean) => {
    set({ visuals3D: enabled });
    void saveKvJson('ui_visuals_3d', enabled);
  },

  dismissDarkSuggestion: () => {
    set({ darkSuggestionDismissed: true });
    void saveKvJson('ui_dark_suggestion_dismissed', true);
  },
}));
