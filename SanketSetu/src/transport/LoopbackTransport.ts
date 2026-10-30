/**
 * Loopback Transport for Deterministic Unit Testing (src/transport/LoopbackTransport.ts)
 * Connects in-memory nodes synchronously or with controlled step flushing so unit tests
 * can verify multi-hop routing, link breaks, and anti-entropy sync in milliseconds.
 */

import {
  PacketReceivedCallback,
  PeerEventCallback,
  Transport,
  TransportPeerSummary,
} from './Transport';

export class LoopbackHub {
  private readonly nodes = new Map<string, LoopbackTransport>();
  private readonly links = new Set<string>();

  private edgeKey(a: string, b: string): string {
    return a < b ? `${a}<->${b}` : `${b}<->${a}`;
  }

  public register(node: LoopbackTransport): void {
    this.nodes.set(node.nodeId, node);
  }

  public async connect(a: string, b: string): Promise<void> {
    const key = this.edgeKey(a, b);
    const wasConnected = this.links.has(key);
    this.links.add(key);

    if (!wasConnected) {
      const nodeA = this.nodes.get(a);
      const nodeB = this.nodes.get(b);
      if (nodeA && nodeB && nodeA.isStarted() && nodeB.isStarted()) {
        await nodeA.notifyPeer({
          peerId: b,
          displayName: nodeB.displayName,
          status: 'found',
          rssi: -52,
          linkQuality: 95,
        });
        await nodeB.notifyPeer({
          peerId: a,
          displayName: nodeA.displayName,
          status: 'found',
          rssi: -52,
          linkQuality: 95,
        });
      }
    }
  }

  public disconnect(a: string, b: string): void {
    const key = this.edgeKey(a, b);
    if (this.links.delete(key)) {
      const nodeA = this.nodes.get(a);
      const nodeB = this.nodes.get(b);
      nodeA?.notifyPeer({ peerId: b, status: 'lost' });
      nodeB?.notifyPeer({ peerId: a, status: 'lost' });
    }
  }

  public areConnected(a: string, b: string): boolean {
    return this.links.has(this.edgeKey(a, b));
  }

  public getNeighbors(nodeId: string): TransportPeerSummary[] {
    const out: TransportPeerSummary[] = [];
    for (const [otherId, otherNode] of this.nodes.entries()) {
      if (otherId === nodeId) continue;
      if (otherNode.isStarted() && this.areConnected(nodeId, otherId)) {
        out.push({
          peerId: otherId,
          displayName: otherNode.displayName,
          rssi: -52,
          linkQuality: 95,
        });
      }
    }
    return out;
  }

  public async deliver(fromId: string, toId: string, bytes: Uint8Array): Promise<boolean> {
    if (!this.areConnected(fromId, toId)) return false;
    const target = this.nodes.get(toId);
    if (!target || !target.isStarted()) return false;
    await target.receiveBytes(fromId, new Uint8Array(bytes));
    return true;
  }
}

export class LoopbackTransport implements Transport {
  public readonly transportName = 'loopback' as const;
  public readonly nodeId: string;
  public readonly displayName: string;
  private readonly hub: LoopbackHub;
  private started = false;
  private readonly peerListeners = new Set<PeerEventCallback>();
  private readonly packetListeners = new Set<PacketReceivedCallback>();

  constructor(nodeId: string, displayName: string, hub: LoopbackHub) {
    this.nodeId = nodeId;
    this.displayName = displayName;
    this.hub = hub;
    this.hub.register(this);
  }

  public isStarted(): boolean {
    return this.started;
  }

  public async start(): Promise<void> {
    this.started = true;
    for (const peer of this.hub.getNeighbors(this.nodeId)) {
      await this.notifyPeer({
        peerId: peer.peerId,
        displayName: peer.displayName,
        status: 'found',
        rssi: peer.rssi,
        linkQuality: peer.linkQuality,
      });
    }
  }

  public async stop(): Promise<void> {
    this.started = false;
  }

  public async send(peerId: string, bytes: Uint8Array): Promise<boolean> {
    if (!this.started) return false;
    return this.hub.deliver(this.nodeId, peerId, bytes);
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
    if (!this.started) return [];
    return this.hub.getNeighbors(this.nodeId);
  }

  public async notifyPeer(event: Parameters<PeerEventCallback>[0]): Promise<void> {
    for (const cb of this.peerListeners) {
      await cb(event);
    }
  }

  public async receiveBytes(fromPeerId: string, bytes: Uint8Array): Promise<void> {
    for (const cb of this.packetListeners) {
      await cb(fromPeerId, bytes);
    }
  }
}
