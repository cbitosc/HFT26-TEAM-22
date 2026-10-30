/**
 * Fake native bridge (tests/fakeNative.ts): behaves like the real NearbyMesh Capacitor plugin as
 * seen from JavaScript. Endpoint ids are random strings that are NOT node ids, payloads cross as
 * base64, events carry the same fields the Kotlin plugin emits, and delivery is asynchronous.
 */
import type { PluginListenerHandle } from '@capacitor/core';
import type {
  MeshPermissionState,
  NativeDiagnostics,
  NearbyMeshPluginInterface,
  NearbyStartResult,
} from '../src/transport/NearbyTransport';

type Listener = (event: never) => void;

export class FakeBridge implements NearbyMeshPluginInterface {
  private readonly listeners = new Map<string, Set<Listener>>();
  /** endpointId (as seen by THIS phone) -> the remote phone and the id it uses for us */
  readonly links = new Map<string, { remote: FakeBridge; remoteEndpointId: string }>();
  started = false;
  startCalls = 0;
  permissionsGranted = true;
  readonly sentPayloads: Array<{ to: string; bytes: number }> = [];

  constructor(readonly nodeId: string, readonly name: string) {}

  emit(event: string, data: unknown): void {
    for (const l of this.listeners.get(event) ?? []) (l as (d: unknown) => void)(data);
  }

  async addListener(eventName: string, fn: Listener): Promise<PluginListenerHandle> {
    const set = this.listeners.get(eventName) ?? new Set();
    set.add(fn);
    this.listeners.set(eventName, set);
    return { remove: async () => void set.delete(fn) };
  }

  async start(): Promise<NearbyStartResult> {
    this.startCalls += 1;
    if (!this.permissionsGranted) throw new Error('Missing permissions: bluetoothScan');
    this.started = true;
    return { advertising: true, discovering: true, foregroundService: true };
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  async sendPayload(o: { peerId?: string; bytesBase64: string }): Promise<{ sent: boolean; reason?: string }> {
    const targets = o.peerId && o.peerId !== 'BROADCAST' ? [o.peerId] : [...this.links.keys()];
    const link = targets.length === 1 ? this.links.get(targets[0]) : undefined;
    if (targets.length === 0 || (targets.length === 1 && !link)) return { sent: false, reason: 'no_peers' };
    for (const t of targets) {
      const l = this.links.get(t);
      if (!l) continue;
      this.sentPayloads.push({ to: t, bytes: Buffer.from(o.bytesBase64, 'base64').length });
      // real delivery is asynchronous
      setTimeout(
        () => l.remote.emit('payloadReceived', { peerId: l.remoteEndpointId, nodeId: this.nodeId, bytesBase64: o.bytesBase64 }),
        1
      );
    }
    return { sent: true };
  }

  async getPeers() {
    return { peers: [] };
  }
  async drainPendingPayloads() {
    return { payloads: [] };
  }
  async getDiagnostics(): Promise<NativeDiagnostics> {
    throw new Error('not needed in tests');
  }
  async ensureHardwareKeyBacked() {
    return { hardwareBacked: false };
  }
  async checkMeshPermissions(): Promise<MeshPermissionState> {
    return { allGranted: this.permissionsGranted, sdkInt: 34 };
  }
  async requestMeshPermissions(): Promise<MeshPermissionState> {
    return this.checkMeshPermissions();
  }
  async openAppSettings() {}
  async showAlertNotification() {}
  async setPowerMode(o: { mode: string }) {
    return o;
  }
}

let counter = 0;

/**
 * Connects two fake phones the way Nearby does. `delayBFoundMs` postpones the *second* phone's
 * peerFound event, reproducing the real race where the first phone's HELLO arrives before the
 * second phone has been told the link is up.
 */
export function connect(a: FakeBridge, b: FakeBridge, delayBFoundMs = 0): void {
  const epAtA = `ep${(++counter).toString(36)}x${b.nodeId.slice(0, 2)}`; // how A names B
  const epAtB = `ep${(++counter).toString(36)}y${a.nodeId.slice(0, 2)}`; // how B names A
  a.links.set(epAtA, { remote: b, remoteEndpointId: epAtB });
  b.links.set(epAtB, { remote: a, remoteEndpointId: epAtA });
  a.emit('peerFound', { peerId: epAtA, nodeId: b.nodeId, displayName: b.name });
  const fireB = () => b.emit('peerFound', { peerId: epAtB, nodeId: a.nodeId, displayName: a.name });
  if (delayBFoundMs > 0) setTimeout(fireB, delayBFoundMs);
  else fireB();
}

export function disconnect(a: FakeBridge, b: FakeBridge): void {
  for (const [ep, l] of [...a.links]) {
    if (l.remote === b) {
      a.links.delete(ep);
      a.emit('peerLost', { peerId: ep });
      b.links.delete(l.remoteEndpointId);
      b.emit('peerLost', { peerId: l.remoteEndpointId });
    }
  }
}

export async function waitFor(cond: () => boolean, ms = 1500, label = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}
