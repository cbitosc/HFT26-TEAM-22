/**
 * Native Google Nearby Connections Transport (src/transport/NearbyTransport.ts)
 * Per §2 & §3:
 * Wraps the custom Capacitor Kotlin plugin `NearbyMesh` (`Strategy.P2P_CLUSTER`,
 * using Bluetooth + BLE + Wi-Fi Direct under the hood).
 * Exposes `startAdvertising`, `startDiscovery`, `stop`, `sendPayload(peerId, bytes)`, `getPeers`,
 * and events `peerFound`, `peerLost`, `payloadReceived`, `linkQuality`.
 */

import { registerPlugin, PluginListenerHandle } from '@capacitor/core';
import {
  PacketReceivedCallback,
  PeerEventCallback,
  Transport,
  TransportPeerSummary,
} from './Transport';
import { base64ToBytes, bytesToBase64 } from '../crypto/identity';
import { MESH_CONSTANTS } from '../mesh/constants';

export interface FanOutLimitEvent {
  evictedPeerId: string;
  incomingPeerId: string;
  maxConcurrent: number;
  reason: string;
  ts: number;
}

export interface NearbyMeshPluginInterface {
  startAdvertising(options: {
    displayName: string;
    serviceId: string;
    strategy: 'P2P_CLUSTER';
  }): Promise<{ started: boolean }>;
  startDiscovery(options: {
    serviceId: string;
    strategy: 'P2P_CLUSTER';
  }): Promise<{ started: boolean }>;
  stop(): Promise<void>;
  sendPayload(options: {
    peerId: string;
    bytesBase64: string;
  }): Promise<{ sent: boolean }>;
  getPeers(): Promise<{ peers: TransportPeerSummary[] }>;
  ensureHardwareKeyBacked(): Promise<{
    hardwareBacked: boolean;
    alias?: string;
    fallback?: string;
  }>;
  addListener(
    eventName: 'peerFound',
    listenerFunc: (event: {
      peerId: string;
      displayName: string;
      rssi: number;
      linkQuality: number;
    }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'peerLost',
    listenerFunc: (event: { peerId: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'payloadReceived',
    listenerFunc: (event: { peerId: string; bytesBase64: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'linkQuality',
    listenerFunc: (event: {
      peerId: string;
      rssi: number;
      linkQuality: number;
    }) => void
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

export class NearbyTransport implements Transport {
  public readonly transportName = 'nearby' as const;
  private readonly displayName: string;
  private readonly serviceId: string;
  private readonly maxConcurrent: number;
  private readonly peers = new Map<string, TransportPeerSummary>();
  private readonly peerLastActiveMs = new Map<string, number>();
  private readonly fanOutLog: FanOutLimitEvent[] = [];
  private readonly peerListeners = new Set<PeerEventCallback>();
  private readonly packetListeners = new Set<PacketReceivedCallback>();
  private handles: PluginListenerHandle[] = [];

  constructor(
    displayName: string,
    serviceId = 'org.sanket.mesh.p2p.cluster',
    maxConcurrent = MESH_CONSTANTS.MAX_CONCURRENT_CONNECTIONS
  ) {
    this.displayName = displayName;
    this.serviceId = serviceId;
    this.maxConcurrent = maxConcurrent;
  }

  private enforceConcurrentCap(incomingPeerId: string): void {
    if (
      this.peers.size < this.maxConcurrent ||
      this.peers.has(incomingPeerId)
    ) {
      return;
    }
    let oldestPeerId: string | undefined;
    let oldestTs = Infinity;
    for (const [peerId, ts] of this.peerLastActiveMs.entries()) {
      if (ts < oldestTs) {
        oldestTs = ts;
        oldestPeerId = peerId;
      }
    }
    const targetEvict = oldestPeerId ?? this.peers.keys().next().value;
    if (targetEvict) {
      this.peers.delete(targetEvict);
      this.peerLastActiveMs.delete(targetEvict);
      this.fanOutLog.push({
        evictedPeerId: targetEvict,
        incomingPeerId,
        maxConcurrent: this.maxConcurrent,
        reason: `Rotated idle neighbor ${targetEvict} to respect P2P_CLUSTER ${this.maxConcurrent}-peer concurrent cap`,
        ts: Date.now(),
      });
      for (const cb of this.peerListeners) {
        cb({ peerId: targetEvict, status: 'lost' });
      }
    }
  }

  public getFanOutLog(): FanOutLimitEvent[] {
    return [...this.fanOutLog];
  }

  public async checkHardwareKeystore(): Promise<{
    hardwareBacked: boolean;
    providerLabel: string;
  }> {
    try {
      const res = await NearbyMeshNative.ensureHardwareKeyBacked();
      return {
        hardwareBacked: res.hardwareBacked,
        providerLabel: res.hardwareBacked
          ? `AndroidKeyStore (${res.alias ?? 'AES-256-GCM'})`
          : 'PIN-derived XSalsa20-Poly1305 Vault',
      };
    } catch {
      return {
        hardwareBacked: false,
        providerLabel: 'PIN-derived XSalsa20-Poly1305 Vault (IndexedDB)',
      };
    }
  }

  public async start(): Promise<void> {
    try {
      const hFound = await NearbyMeshNative.addListener('peerFound', (ev) => {
        this.enforceConcurrentCap(ev.peerId);
        const summary: TransportPeerSummary = {
          peerId: ev.peerId,
          displayName: ev.displayName,
          rssi: ev.rssi ?? -65,
          linkQuality: ev.linkQuality ?? 80,
        };
        this.peers.set(ev.peerId, summary);
        this.peerLastActiveMs.set(ev.peerId, Date.now());
        for (const cb of this.peerListeners) {
          cb({
            peerId: ev.peerId,
            displayName: ev.displayName,
            status: 'found',
            rssi: summary.rssi,
            linkQuality: summary.linkQuality,
          });
        }
      });

      const hLost = await NearbyMeshNative.addListener('peerLost', (ev) => {
        this.peers.delete(ev.peerId);
        this.peerLastActiveMs.delete(ev.peerId);
        for (const cb of this.peerListeners) {
          cb({ peerId: ev.peerId, status: 'lost' });
        }
      });

      const hPayload = await NearbyMeshNative.addListener(
        'payloadReceived',
        (ev) => {
          this.peerLastActiveMs.set(ev.peerId, Date.now());
          const bytes = base64ToBytes(ev.bytesBase64);
          for (const cb of this.packetListeners) {
            cb(ev.peerId, bytes);
          }
        }
      );

      const hQuality = await NearbyMeshNative.addListener(
        'linkQuality',
        (ev) => {
          this.peerLastActiveMs.set(ev.peerId, Date.now());
          const existing = this.peers.get(ev.peerId);
          if (existing) {
            existing.rssi = ev.rssi;
            existing.linkQuality = ev.linkQuality;
          }
        }
      );

      const hFanOut = await NearbyMeshNative.addListener(
        'fanOutLimit',
        (ev) => {
          this.fanOutLog.push({
            ...ev,
            ts: Date.now(),
          });
        }
      );

      this.handles.push(hFound, hLost, hPayload, hQuality, hFanOut);

      await NearbyMeshNative.startAdvertising({
        displayName: this.displayName,
        serviceId: this.serviceId,
        strategy: 'P2P_CLUSTER',
      });
      await NearbyMeshNative.startDiscovery({
        serviceId: this.serviceId,
        strategy: 'P2P_CLUSTER',
      });
    } catch {
      // Running in web browser without native Android bridge; handled gracefully by SimTransport
    }
  }

  public async stop(): Promise<void> {
    for (const h of this.handles) {
      await h.remove();
    }
    this.handles = [];
    this.peers.clear();
    this.peerLastActiveMs.clear();
    try {
      await NearbyMeshNative.stop();
    } catch {
      // Ignore if running in browser
    }
  }

  public async send(peerId: string, bytes: Uint8Array): Promise<boolean> {
    try {
      this.peerLastActiveMs.set(peerId, Date.now());
      const res = await NearbyMeshNative.sendPayload({
        peerId,
        bytesBase64: bytesToBase64(bytes),
      });
      return res.sent;
    } catch {
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
}
