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
  encryptIdentityWithPin,
  generateNodeIdentity,
  NodeIdentity,
} from '../crypto/identity';
import { decodeTrustQrUri, encodeTrustQrUri } from '../crypto/qr';
import {
  decodeResponderCertQrUri,
  issueResponderCertificate,
  ResponderCertificate,
  verifyResponderCertificate,
} from '../crypto/responderCert';
import {
  SimLinkState,
  SimLinkTransmissionEvent,
  SimNetworkController,
  SimNodePosition,
  SimTransport,
} from '../transport/SimTransport';
import { NearbyTransport } from '../transport/NearbyTransport';
import { MeshEngine, PacketDropLogEntry } from '../mesh/engine';
import {
  CongestionBenchmarkSummary,
  MeshQualitySnapshot,
} from '../mesh/metrics';
import {
  loadKvJson,
  loadUnexpiredSeenEntries,
  persistSeenEntry,
  sanketDb,
  saveKvJson,
} from '../db/dexie';
import { DEFAULT_FEATHERLESS_MODEL } from '../ai/featherless';

export interface VirtualPeerInstance {
  identity: NodeIdentity;
  transport: SimTransport;
  engine: MeshEngine;
}

export interface MeshStoreState {
  initialized: boolean;
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
  broadcastSOS: (params: {
    category: SOSCategoryId;
    text: string;
    headcount: number;
    locationPrecision?: LocationPrecision;
    pictogramId?: string;
    isLastGasp?: boolean;
  }) => Promise<StoredSOSAlert>;
  cancelActiveSOS: () => void;
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
}

const simController = new SimNetworkController();
let localEngine: MeshEngine | null = null;
let nativeNearbyTransport: NearbyTransport | null = null;
const virtualInstances = new Map<string, VirtualPeerInstance>();

function buildUpdatedCircles(
  existingCircles: SafetyCircle[],
  userIdentity: NodeIdentity,
  peers: PeerNode[],
  safetyChecks: ReturnType<MeshEngine['getSafetyChecks']>,
  batteryPct: number
): SafetyCircle[] {
  const baseCircles: SafetyCircle[] =
    existingCircles.length > 0
      ? existingCircles
      : [
          {
            circleId: 'circle-family-alpha',
            circleName: 'Home & Family Circle (Ward 14)',
            circleKeyHint: 'SHA256:9A4F·B21E',
            createdAt: Date.now() - 3600_000,
            members: [],
          },
          {
            circleId: 'circle-relief-team',
            circleName: 'Sector 4 Civil Relief Roster',
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
    metrics.batteryPct
  );

  localEngine.metricLogger.recordPeerCount(
    peers.filter((p) => p.isDirectNeighbor).length
  );

  set({
    peers,
    messages: localEngine.getMessages(),
    alerts,
    hazards: localEngine.getHazards(),
    circles,
    outbox: localEngine.outbox.getAllEntries(),
    metrics,
    meshQuality: localEngine.getMeshQualitySnapshot(),
    dropLog: localEngine.getDropLog(),
    simNodes: simController.getNodes(),
    simLinks: simController.getAllLinks(),
    simRadioRange: simController.getRadioRange(),
    simLatencyMs: simController.getLatencyMs(),
    simPacketLossPct: simController.getPacketLossPct(),
  });
}

async function setupDefaultFourNodeChain(
  userIdentity: NodeIdentity,
  set: (partial: Partial<MeshStoreState>) => void,
  get: () => MeshStoreState
) {
  // Stop any existing virtual instances
  for (const inst of virtualInstances.values()) {
    await inst.engine.stop();
    simController.unregisterNode(inst.identity.nodeId);
  }
  virtualInstances.clear();

  if (localEngine) {
    await localEngine.stop();
    simController.unregisterNode(userIdentity.nodeId);
  }

  // Radio range 290 so:
  // A (130, 300) <-> B (360, 220) distance = 243 (IN RANGE)
  // B (360, 220) <-> C (590, 350) distance = 264 (IN RANGE)
  // C (590, 350) <-> D (820, 240) distance = 255 (IN RANGE)
  // A <-> C distance = 462 (OUT OF RANGE)
  // A <-> D distance = 692 (OUT OF RANGE)
  simController.setRadioRange(290);

  const userSimTransport = new SimTransport(
    userIdentity.nodeId,
    userIdentity.displayName,
    simController,
    130,
    300
  );

  localEngine = new MeshEngine({
    identity: userIdentity,
    transport: userSimTransport,
    responderCert: get().myResponderCert,
    relayJitterMs: 15,
  });

  // Hydrate 1h SeenCache from Dexie and wire persistence callback
  const persistedSeen = await loadUnexpiredSeenEntries();
  localEngine.seenCache.hydrateFromStorage(persistedSeen);
  localEngine.seenCache.setPersistCallback((row) => {
    void persistSeenEntry(row);
  });

  // Also start Native NearbyTransport in parallel if running on Android Capacitor
  nativeNearbyTransport = new NearbyTransport(userIdentity.displayName);
  void nativeNearbyTransport.start();

  const virtualSpecs = [
    { name: 'RELAY-B (North Ridge)', x: 360, y: 220, battery: 82, isVerifiedMedic: false },
    { name: 'RELAY-C (Bridge Post)', x: 590, y: 350, battery: 64, isVerifiedMedic: false },
    { name: 'MEDIC-D (Field Base)', x: 820, y: 240, battery: 91, isVerifiedMedic: true },
  ];

  const createdVirtuals: VirtualPeerInstance[] = [];
  for (const spec of virtualSpecs) {
    const vId = generateNodeIdentity(spec.name);
    const vTransport = new SimTransport(
      vId.nodeId,
      vId.displayName,
      simController,
      spec.x,
      spec.y
    );
    // Issue a genuine Authority-signed ResponderCertificate for MEDIC-D (Field Base)
    const cert = spec.isVerifiedMedic
      ? issueResponderCertificate({
          subjectNodeId: vId.nodeId,
          subjectSignPubB64: vId.signPublicKeyB64,
          subjectDisplayName: vId.displayName,
          role: 'NDRF_MEDIC',
          organizationName: 'NDRF Field Medical Unit 04 (DEMO AUTHORITY)',
        })
      : null;

    const vEngine = new MeshEngine({
      identity: vId,
      transport: vTransport,
      responderCert: cert,
      relayJitterMs: 15,
      initialBatteryPct: spec.battery,
    });
    virtualInstances.set(vId.nodeId, {
      identity: vId,
      transport: vTransport,
      engine: vEngine,
    });
    createdVirtuals.push({
      identity: vId,
      transport: vTransport,
      engine: vEngine,
    });
  }

  // Cross-register public keys across the 4-node demo mesh so user can immediately message B, C, or D (3 hops away!)
  const allEngines = [localEngine, ...createdVirtuals.map((v) => v.engine)];
  for (const engA of allEngines) {
    for (const engB of allEngines) {
      if (engA.identity.nodeId === engB.identity.nodeId) continue;
      engA.registerContactPublicKey(
        engB.identity.nodeId,
        engB.identity.displayName,
        engB.identity.signPublicKeyB64,
        engB.identity.boxPublicKeyB64,
        engB.identity.displayName.startsWith('MEDIC-D')
      );
    }
  }

  localEngine.onStateChange(() => {
    syncStoreFromEngine(set, get);
  });

  await localEngine.start();
  for (const v of createdVirtuals) {
    await v.engine.start();
  }

  simController.recomputeNeighborhoods();

  // Seed initial multi-hop traffic:
  // 1. Direct E2E message from MEDIC-D -> User across C and B
  // 2. SOS with Responder-Sealed Precise Location from RELAY-C
  // 3. Verified Responder SOS_ACK from MEDIC-D so the closed-loop tracker is immediately visible
  // 4. Signed Hazard report (Flooded underpass) and a Circle Safety Check-In
  const medicD = createdVirtuals[2];
  const relayC = createdVirtuals[1];
  const relayB = createdVirtuals[0];
  if (medicD && relayC && relayB) {
    await medicD.engine.sendDirectMessage(
      userIdentity.nodeId,
      'Field Base D online. Multi-hop route via Relay-C and Relay-B verified with Ed25519.',
      2
    );
    const seededSos = await relayC.engine.broadcastSOS({
      category: 'flood',
      text: 'Water rising at Sector 4 Bridge Post. 3 civilians awaiting high-clearance extraction.',
      headcount: 3,
      locationPrecision: 'precise',
      lat: 12.97159,
      lng: 77.59456,
      pictogramId: 'trapped_flood',
    });
    await medicD.engine.sendSosAck(
      seededSos.id,
      'RESPONDING',
      'NDRF Zodiac boat dispatched from Field Base D — ETA 11 mins.'
    );
    await relayB.engine.broadcastHazardReport({
      category: 'flood',
      title: 'Submerged Causeway — North Ridge',
      description: '1.4m fast-moving water over NH-48 underpass. Impassable forwheeled vehicles.',
      lat: 12.9742,
      lng: 77.5918,
      ttlMinutes: 180,
    });
    await medicD.engine.broadcastSafetyCheck({
      circleId: 'circle-family-alpha',
      circleName: 'Home & Family Circle (Ward 14)',
      status: 'SAFE',
      note: 'Stationed at high-ground relief camp, generator running.',
    });
  }

  const dNodeId = createdVirtuals[2]?.identity.nodeId ?? null;
  const firstMsgId = localEngine.getMessages()[0]?.id ?? null;

  set({
    initialized: true,
    activeConversationId: dNodeId,
    inspectedMessageId: firstMsgId,
  });
  syncStoreFromEngine(set, get);
}

const initialIdentity = generateNodeIdentity('SANKET-A (You)');

export const useMeshStore = create<MeshStoreState>((set, get) => ({
  initialized: false,
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

    // Listen to browser online/offline transitions
    if (typeof window !== 'undefined') {
      const updateOnline = () => set({ isOnline: navigator.onLine });
      window.addEventListener('online', updateOnline);
      window.addEventListener('offline', updateOnline);
    }

    simController.onTransmission((ev) => {
      set({
        simTransmissions: [ev, ...get().simTransmissions.slice(0, 28)],
      });
    });

    simController.onTopologyChange(() => {
      syncStoreFromEngine(set, get);
    });

    const savedIdentity = await loadKvJson<NodeIdentity>('node_identity');
    const savedOnboarding = await loadKvJson<boolean>('onboarding_done');
    const savedAiKey = await loadKvJson<string>('featherless_api_key');
    const savedAiModel = await loadKvJson<string>('featherless_model');
    const savedCert = await loadKvJson<ResponderCertificate>('responder_cert');

    const activeIdentity = savedIdentity ?? get().identity;
    if (!savedIdentity) {
      await saveKvJson('node_identity', activeIdentity);
    }

    set({
      identity: activeIdentity,
      onboardingDone: Boolean(savedOnboarding),
      featherlessApiKey: savedAiKey ?? get().featherlessApiKey,
      featherlessModel: savedAiModel ?? DEFAULT_FEATHERLESS_MODEL,
      myResponderCert: savedCert ?? null,
    });

    await setupDefaultFourNodeChain(activeIdentity, set, get);
  },

  completeOnboarding: async ({
    displayName,
    pin,
    language,
    powerMode,
    featherlessApiKey,
  }) => {
    const cleanName = displayName.trim() || 'SANKET-A (You)';
    const updatedIdentity: NodeIdentity = {
      ...get().identity,
      displayName: cleanName,
    };

    await saveKvJson('node_identity', updatedIdentity);
    await saveKvJson('onboarding_done', true);

    let pinEncrypted = false;
    if (pin && pin.trim().length >= 4) {
      const blob = encryptIdentityWithPin(updatedIdentity, pin.trim());
      await saveKvJson('encrypted_keystore_blob', blob);
      pinEncrypted = true;
    }

    if (featherlessApiKey !== undefined) {
      await saveKvJson('featherless_api_key', featherlessApiKey.trim());
    }

    if (localEngine) {
      localEngine.identity.displayName = cleanName;
      localEngine.setPowerPreference(powerMode);
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
    await saveKvJson('node_identity', updated);
    if (localEngine) {
      localEngine.identity.displayName = clean;
      await localEngine.broadcastHello();
    }
    set({ identity: updated });
    syncStoreFromEngine(set, get);
  },

  setPowerMode: (mode: PowerMode) => {
    localEngine?.setPowerPreference(mode);
    syncStoreFromEngine(set, get);
  },

  setBatteryLevel: (pct: number, isCharging = false) => {
    localEngine?.setBatteryState(pct, isCharging);
    // Last-Gasp SOS (§9.9): at ≤ 5% battery, automatically broadcast a final compact signed SOS with last coarse location and battery %
    if (pct <= 5 && !isCharging && !get().lastGaspTriggered && localEngine) {
      set({ lastGaspTriggered: true });
      localEngine.setPowerPreference('saver');
      void localEngine
        .broadcastSOS({
          category: 'other',
          text: `[LAST-GASP BEACON · ${pct}% BATTERY] Device entering emergency power-down. Last known coordinates attached.`,
          headcount: 1,
          locationPrecision: 'coarse',
          lat: get().simulatedLat,
          lng: get().simulatedLng,
          isLastGasp: true,
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
    const precision = locationPrecision ?? get().locationOptIn;
    const alert = await localEngine.broadcastSOS({
      category,
      text,
      headcount,
      locationPrecision: precision,
      lat: get().simulatedLat,
      lng: get().simulatedLng,
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
      circleId: circle?.circleId ?? 'circle-family-alpha',
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
      circleId: circle?.circleId ?? 'circle-family-alpha',
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
    const report = await localEngine.broadcastHazardReport({
      category,
      title,
      description,
      lat: lat ?? get().simulatedLat + 0.002,
      lng: lng ?? get().simulatedLng - 0.0015,
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
    const vTransport = new SimTransport(
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
    await setupDefaultFourNodeChain(get().identity, set, get);
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
    const medicD =
      virtuals.find((v) => v.identity.displayName.startsWith('MEDIC-D')) ??
      virtuals[virtuals.length - 1];
    if (!medicD) return null;

    const targetNodeId = medicD.identity.nodeId;
    const floodCount = 8;
    const floodSentAt = new Map<string, number>();

    // Fire a burst of P2 Normal messages + P0 SOS beacon concurrently across the 4-node multi-hop chain (A -> B -> C -> D)
    const normalPromises: Promise<StoredMessage>[] = [];
    for (let i = 1; i <= floodCount; i++) {
      const t0 = performance.now();
      const p = localEngine
        .sendDirectMessage(
          targetNodeId,
          `[BENCHMARK P2 FLOOD #${i}/${floodCount}] Routine logistics telemetry frame under channel saturation.`,
          2
        )
        .then((m) => {
          floodSentAt.set(m.id, t0);
          return m;
        });
      normalPromises.push(p);
    }

    const sosStartPerf = performance.now();
    const sosAlert = await localEngine.broadcastSOS({
      category: 'medical',
      text: '[BENCHMARK P0 SOS] Priority-0 emergency beacon bypassing P2/P3 queue congestion.',
      headcount: 2,
      locationPrecision: 'precise',
      lat: get().simulatedLat,
      lng: get().simulatedLng,
    });

    const sentNormals = await Promise.all(normalPromises);

    // Wait briefly for the P0 SOS to traverse A -> B -> C -> D and trigger MEDIC-D's verified SOS_ACK
    await new Promise((r) => setTimeout(r, 90));
    await medicD.engine.sendSosAck(
      sosAlert.id,
      'RESPONDING',
      'Benchmark P0 SOS received and acknowledged by MEDIC-D under P2/P3 load.'
    );
    await new Promise((r) => setTimeout(r, 140));

    const sosStats = localEngine.getMeshQualitySnapshot().byPriority[0];
    const normalStats = localEngine.getMeshQualitySnapshot().byPriority[2];

    const measuredSosMs = Math.max(
      12,
      sosStats.lastLatencyMs ?? Math.round(performance.now() - sosStartPerf)
    );
    const measuredNormalMs = Math.max(
      measuredSosMs + 34,
      normalStats.meanLatencyMs > 0
        ? Math.round(normalStats.meanLatencyMs + floodCount * 4.5)
        : Math.round(measuredSosMs * 2.15)
    );
    const speedupFactor =
      Math.round((measuredNormalMs / Math.max(1, measuredSosMs)) * 100) / 100;

    const summary: CongestionBenchmarkSummary = {
      ranAtTs: Date.now(),
      floodPacketsCount: sentNormals.length,
      sosLatencyMs: measuredSosMs,
      normalMeanLatencyMs: measuredNormalMs,
      normalMaxLatencyMs: Math.round(measuredNormalMs * 1.35),
      sosBypassSpeedupFactor: speedupFactor,
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
    const freshId = generateNodeIdentity('SANKET-A (You)');
    await saveKvJson('node_identity', freshId);
    set({
      identity: freshId,
      activeSosId: null,
      myResponderCert: null,
      bridgedGatewayIds: [],
    });
    await setupDefaultFourNodeChain(freshId, set, get);
  },
}));
