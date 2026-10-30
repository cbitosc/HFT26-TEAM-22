/**
 * Native Google Nearby Connections transport (src/transport/NearbyTransport.ts).
 *
 * Wraps the Capacitor plugin `NearbyMesh` (Strategy.P2P_CLUSTER over Bluetooth + Wi-Fi Direct).
 * The plugin is injected so tests can drive this class with a fake native bridge that emits the
 * same event shapes as the real one.
 *
 * Differences from a naive wrapper, each fixing a real-phone failure:
 * - listeners are attached once; `startRadio()` can be called again (after permissions are granted,
 *   after Bluetooth is switched on, from the diagnostics screen) without duplicating them;
 * - a failed start is recorded and surfaced, never swallowed;
 * - peers carry `nodeId` (from the endpoint name), because a Nearby endpointId is only a handle.
 */

import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import {
  PacketReceivedCallback,
  PeerEventCallback,
  Transport,
  TransportPeerSummary,
} from './Transport';
import { base64ToBytes, bytesToBase64 } from '../crypto/identity';

export interface FanOutLimitEvent {
  evictedPeerId: string;
  incomingPeerId: string;
  maxConcurrent: number;
  reason: string;
  ts: number;
}

/**
 * Per-permission grant state. `allGranted` means every permission the RADIO needs on this Android
 * version is granted (it ignores optional ones such as notifications). Keys not applicable to this
 * Android version are absent.
 */
export interface MeshPermissionState {
  fineLocation?: boolean;
  bluetoothScan?: boolean;
  bluetoothAdvertise?: boolean;
  bluetoothConnect?: boolean;
  nearbyWifi?: boolean;
  notifications?: boolean;
  missing?: string[];
  allGranted: boolean;
  sdkInt: number;
}

export interface NativeError {
  code: number;
  message: string;
  at: number;
}

export interface NearbyStartResult {
  advertising: boolean;
  discovering: boolean;
  advertisingError?: NativeError;
  discoveryError?: NativeError;
  foregroundService: boolean;
}

export interface NativeDiagnostics {
  permissions: MeshPermissionState;
  sdkInt: number;
  bluetoothEnabled: boolean;
  wifiEnabled: boolean;
  locationServicesEnabled: boolean;
  foregroundService: boolean;
  nodeId: string;
  serviceId: string;
  powerMode: string;
  advertising: { active: boolean; error?: NativeError };
  discovery: { active: boolean; error?: NativeError };
  discovered: Array<{ endpointId: string; name: string; nodeId?: string }>;
  connected: Array<{ endpointId: string; name: string; nodeId?: string }>;
  sentCount: number;
  receivedCount: number;
  sendFailures: number;
  lastSent?: { at: number; bytes: number; peer: string };
  lastReceived?: { at: number; bytes: number; peer: string };
  log: string[];
}

export interface NearbyMeshPluginInterface {
  /** Starts the foreground service, advertising AND discovery. Resolves with the real outcome. */
  start(options: {
    nodeId: string;
    displayName: string;
    serviceId: string;
    strategy: 'P2P_CLUSTER';
    mode: string;
  }): Promise<NearbyStartResult>;
  stop(): Promise<void>;
  /** `peerId` omitted or "BROADCAST" sends to every connected phone. */
  sendPayload(options: {
    peerId?: string;
    bytesBase64: string;
  }): Promise<{ sent: boolean; reason?: string }>;
  getPeers(): Promise<{ peers: Array<{ peerId: string; nodeId?: string; displayName: string }> }>;
  drainPendingPayloads(): Promise<{
    payloads: Array<{ peerId: string; nodeId?: string; bytesBase64: string }>;
  }>;
  getDiagnostics(): Promise<NativeDiagnostics>;
  ensureHardwareKeyBacked(): Promise<{ hardwareBacked: boolean; alias?: string; fallback?: string }>;
  checkMeshPermissions(): Promise<MeshPermissionState>;
  requestMeshPermissions(): Promise<MeshPermissionState>;
  openAppSettings(): Promise<void>;
  setPowerMode(options: { mode: string }): Promise<{ mode: string }>;
  addListener(
    eventName: 'permissionState',
    listenerFunc: (event: MeshPermissionState) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'peerFound',
    listenerFunc: (event: { peerId: string; nodeId?: string; displayName: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'peerLost',
    listenerFunc: (event: { peerId: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'payloadReceived',
    listenerFunc: (event: { peerId: string; nodeId?: string; bytesBase64: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'fanOutLimit',
    listenerFunc: (event: {
      evictedPeerId: string;
      incomingPeerId: string;
      maxConcurrent: number;
      reason: string;
    }) => void
  ): Promise<PluginListenerHandle>;
}

export const NearbyMeshNative = registerPlugin<NearbyMeshPluginInterface>('NearbyMesh');

export interface RadioDiagnostics {
  /** null when the native side could not be queried (e.g. a browser). */
  native: NativeDiagnostics | null;
  js: {
    listenersAttached: boolean;
    startAttempts: number;
    lastStart: NearbyStartResult | null;
    lastStartError: string | null;
    peers: number;
    sent: number;
    received: number;
    lastSent: { at: number; bytes: number; to: string } | null;
    lastReceived: { at: number; bytes: number; from: string } | null;
  };
}

function logLine(message: string): void {
  // eslint-disable-next-line no-console
  console.info(`[SanketMesh] ${message}`);
}

export class NearbyTransport implements Transport {
  public readonly transportName = 'nearby' as const;
  private readonly nodeId: string;
  private displayName: string;
  private readonly serviceId: string;
  private readonly bridge: NearbyMeshPluginInterface;
  private mode = 'active';

  private readonly peers = new Map<string, TransportPeerSummary>();
  private readonly fanOutLog: FanOutLimitEvent[] = [];
  private readonly peerListeners = new Set<PeerEventCallback>();
  private readonly packetListeners = new Set<PacketReceivedCallback>();
  private handles: PluginListenerHandle[] = [];
  private listenersAttached = false;
  private visibilityHooked = false;

  private startAttempts = 0;
  private lastStart: NearbyStartResult | null = null;
  private lastStartError: string | null = null;
  private sent = 0;
  private received = 0;
  private lastSent: { at: number; bytes: number; to: string } | null = null;
  private lastReceived: { at: number; bytes: number; from: string } | null = null;

  constructor(
    nodeId: string,
    displayName: string,
    bridge: NearbyMeshPluginInterface = NearbyMeshNative,
    serviceId = 'org.sanket.mesh.p2p.cluster'
  ) {
    this.nodeId = nodeId;
    this.displayName = displayName;
    this.bridge = bridge;
    this.serviceId = serviceId;
  }

  public setDisplayName(name: string): void {
    this.displayName = name;
  }

  public getFanOutLog(): FanOutLimitEvent[] {
    return [...this.fanOutLog];
  }

  public async checkHardwareKeystore(): Promise<{ hardwareBacked: boolean; providerLabel: string }> {
    try {
      const res = await this.bridge.ensureHardwareKeyBacked();
      return {
        hardwareBacked: res.hardwareBacked,
        providerLabel: res.hardwareBacked
          ? `AndroidKeyStore (${res.alias ?? 'AES-256-GCM'})`
          : 'PIN-derived XSalsa20-Poly1305 Vault',
      };
    } catch {
      return { hardwareBacked: false, providerLabel: 'PIN-derived XSalsa20-Poly1305 Vault (IndexedDB)' };
    }
  }

  /** Transport.start(): attach event listeners once, then try to start the radio. Never throws. */
  public async start(): Promise<void> {
    await this.attachListeners();
    await this.startRadio();
    void this.drainPendingPayloads();
  }

  private async attachListeners(): Promise<void> {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    try {
      this.handles.push(
        await this.bridge.addListener('peerFound', (ev) => {
          logLine(`peerFound ${ev.peerId} nodeId=${ev.nodeId ?? '?'} name='${ev.displayName}'`);
          const summary: TransportPeerSummary = {
            peerId: ev.peerId,
            nodeId: ev.nodeId,
            displayName: ev.displayName,
            rssi: 0, // Nearby Connections does not expose signal strength; 0 = unknown
            linkQuality: 0,
          };
          this.peers.set(ev.peerId, summary);
          for (const cb of this.peerListeners) {
            void cb({ peerId: ev.peerId, nodeId: ev.nodeId, displayName: ev.displayName, status: 'found' });
          }
        }),
        await this.bridge.addListener('peerLost', (ev) => {
          logLine(`peerLost ${ev.peerId}`);
          this.peers.delete(ev.peerId);
          for (const cb of this.peerListeners) {
            void cb({ peerId: ev.peerId, status: 'lost' });
          }
        }),
        await this.bridge.addListener('payloadReceived', (ev) =>
          this.handleIncomingPayload(ev.peerId, ev.nodeId, ev.bytesBase64)
        ),
        await this.bridge.addListener('fanOutLimit', (ev) => {
          this.fanOutLog.push({ ...ev, ts: Date.now() });
        })
      );
    } catch (err) {
      this.listenersAttached = false;
      this.lastStartError = `Could not attach native listeners: ${err instanceof Error ? err.message : String(err)}`;
      logLine(this.lastStartError);
      return;
    }
    if (typeof document !== 'undefined' && !this.visibilityHooked) {
      this.visibilityHooked = true;
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /**
   * Starts (or confirms) advertising + discovery. Safe to call repeatedly. Resolves with the native
   * result, or null if the native call itself failed; the reason is kept in the diagnostics.
   */
  public async startRadio(): Promise<NearbyStartResult | null> {
    this.startAttempts += 1;
    try {
      const res = await this.bridge.start({
        nodeId: this.nodeId,
        displayName: this.displayName,
        serviceId: this.serviceId,
        strategy: 'P2P_CLUSTER',
        mode: this.mode,
      });
      this.lastStart = res;
      this.lastStartError = null;
      logLine(`start ok: advertising=${res.advertising} discovering=${res.discovering} fgs=${res.foregroundService}`);
      return res;
    } catch (err) {
      this.lastStartError = err instanceof Error ? err.message : String(err);
      logLine(`start FAILED: ${this.lastStartError}`);
      return null;
    }
  }

  public isRadioRunning(): boolean {
    return Boolean(this.lastStart?.advertising && this.lastStart?.discovering);
  }

  public async stop(): Promise<void> {
    if (typeof document !== 'undefined' && this.visibilityHooked) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.visibilityHooked = false;
    }
    for (const h of this.handles) {
      try {
        await h.remove();
      } catch {
        // listener already gone
      }
    }
    this.handles = [];
    this.listenersAttached = false;
    this.peers.clear();
    this.lastStart = null;
    try {
      await this.bridge.stop();
    } catch {
      // not running
    }
  }

  private handleIncomingPayload(peerId: string, nodeId: string | undefined, bytesBase64: string): void {
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(bytesBase64);
    } catch (err) {
      logLine(`dropped undecodable payload from ${peerId}: ${String(err)}`);
      return;
    }
    this.received += 1;
    this.lastReceived = { at: Date.now(), bytes: bytes.byteLength, from: nodeId ?? peerId };
    for (const cb of this.packetListeners) {
      void cb(peerId, bytes, nodeId);
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.drainPendingPayloads();
    }
  };

  /** Replays payloads the native ring buffer kept while the WebView was paused. Dedup is the engine's job. */
  public async drainPendingPayloads(): Promise<void> {
    try {
      const { payloads } = await this.bridge.drainPendingPayloads();
      for (const p of payloads) this.handleIncomingPayload(p.peerId, p.nodeId, p.bytesBase64);
    } catch {
      // nothing to drain / no native bridge
    }
  }

  public async send(peerId: string, bytes: Uint8Array): Promise<boolean> {
    try {
      const res = await this.bridge.sendPayload({ peerId, bytesBase64: bytesToBase64(bytes) });
      if (res.sent) {
        this.sent += 1;
        const to = this.peers.get(peerId)?.nodeId ?? peerId;
        this.lastSent = { at: Date.now(), bytes: bytes.byteLength, to };
      } else {
        logLine(`send to ${peerId} not sent: ${res.reason ?? 'unknown'}`);
      }
      return res.sent;
    } catch (err) {
      logLine(`send to ${peerId} threw: ${String(err)}`);
      return false;
    }
  }

  public onPeer(cb: PeerEventCallback): () => void {
    this.peerListeners.add(cb);
    return () => this.peerListeners.delete(cb);
  }

  public onPacket(cb: PacketReceivedCallback): () => void {
    this.packetListeners.add(cb);
    return () => this.packetListeners.delete(cb);
  }

  public getPeers(): TransportPeerSummary[] {
    return Array.from(this.peers.values());
  }

  public async setPowerMode(mode: string): Promise<void> {
    this.mode = mode;
    try {
      await this.bridge.setPowerMode({ mode });
    } catch {
      // no native bridge
    }
  }

  public async getDiagnostics(): Promise<RadioDiagnostics> {
    let native: NativeDiagnostics | null = null;
    try {
      native = await this.bridge.getDiagnostics();
    } catch {
      native = null;
    }
    return {
      native,
      js: {
        listenersAttached: this.listenersAttached,
        startAttempts: this.startAttempts,
        lastStart: this.lastStart,
        lastStartError: this.lastStartError,
        peers: this.peers.size,
        sent: this.sent,
        received: this.received,
        lastSent: this.lastSent,
        lastReceived: this.lastReceived,
      },
    };
  }
}
