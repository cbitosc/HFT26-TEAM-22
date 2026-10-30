/**
 * Composite Transport (src/transport/CompositeTransport.ts)
 * Fans a single MeshEngine out across multiple underlying transports at once — e.g. the real
 * `NearbyTransport` (Google Nearby Connections radio) and the in-memory `SimTransport` demo
 * mesh — so the engine sees one merged peer list and the caller doesn't need to special-case
 * which transport a peer actually arrived on. `send()` is routed to whichever sub-transport
 * most recently reported that peer; if unknown, it is tried on every sub-transport.
 */

import {
  PacketReceivedCallback,
  PeerEventCallback,
  Transport,
  TransportPeerEvent,
  TransportPeerSummary,
} from './Transport';

export class CompositeTransport implements Transport {
  public readonly transportName = 'sim' as const;

  private readonly subTransports: Transport[];
  private readonly peerOwner = new Map<string, Transport>();
  private readonly peerListeners = new Set<PeerEventCallback>();
  private readonly packetListeners = new Set<PacketReceivedCallback>();
  private readonly unsubs: Array<() => void> = [];

  constructor(subTransports: Transport[]) {
    this.subTransports = subTransports;
  }

  public async start(): Promise<void> {
    for (const transport of this.subTransports) {
      const unsubPeer = transport.onPeer((ev: TransportPeerEvent) => {
        if (ev.status === 'found') {
          this.peerOwner.set(ev.peerId, transport);
        } else {
          this.peerOwner.delete(ev.peerId);
        }
        for (const cb of this.peerListeners) {
          void cb(ev);
        }
      });
      const unsubPacket = transport.onPacket((fromPeerId, bytes) => {
        for (const cb of this.packetListeners) {
          void cb(fromPeerId, bytes);
        }
      });
      this.unsubs.push(unsubPeer, unsubPacket);
    }

    await Promise.all(this.subTransports.map((t) => t.start()));
  }

  public async stop(): Promise<void> {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;
    this.peerOwner.clear();
    await Promise.all(this.subTransports.map((t) => t.stop()));
  }

  public async send(peerId: string, bytes: Uint8Array): Promise<boolean> {
    const owner = this.peerOwner.get(peerId);
    if (owner) {
      return owner.send(peerId, bytes);
    }
    // Unknown owner (shouldn't normally happen — caller filters by getPeers() first):
    // try every sub-transport and succeed if any of them accepts it.
    const results = await Promise.all(
      this.subTransports.map((t) => t.send(peerId, bytes).catch(() => false))
    );
    return results.some(Boolean);
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
    const merged = new Map<string, TransportPeerSummary>();
    for (const transport of this.subTransports) {
      for (const peer of transport.getPeers()) {
        merged.set(peer.peerId, peer);
      }
    }
    return Array.from(merged.values());
  }
}
