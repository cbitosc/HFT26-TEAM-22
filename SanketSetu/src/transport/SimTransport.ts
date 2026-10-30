/**
 * Virtual Multi-Node Mesh Simulator Transport (src/transport/SimTransport.ts)
 * Per §3 & §8.10:
 * In-memory virtual mesh of N configurable virtual nodes (positions, radio range,
 * manual link up/down overrides, latency, packet loss) running the exact same MeshEngine code.
 * Emits real-time transmission events so the Simulator and Mesh Map UI can animate hops.
 */

import {
  PacketReceivedCallback,
  PeerEventCallback,
  Transport,
  TransportPeerSummary,
} from './Transport';

export interface SimNodePosition {
  nodeId: string;
  displayName: string;
  x: number; // 0..1000 canvas coordinate
  y: number; // 0..600 canvas coordinate
  online: boolean;
  batteryPct: number;
}

export interface SimLinkTransmissionEvent {
  id: string;
  fromId: string;
  toId: string;
  packetType: string;
  packetId: string;
  priority: number;
  timestamp: number;
  dropped: boolean;
}

export interface SimLinkState {
  nodeA: string;
  nodeB: string;
  distance: number;
  inRange: boolean;
  manuallyBlocked: boolean;
  active: boolean;
  rssi: number;
  linkQuality: number;
}

export class SimNetworkController {
  private readonly nodes = new Map<string, SimTransport>();
  private readonly positions = new Map<string, SimNodePosition>();
  private readonly blockedEdges = new Set<string>();
  private radioRange = 290; // default distance threshold in canvas units
  private latencyMs = 35;
  private packetLossPct = 0;
  private readonly transmissionListeners = new Set<
    (ev: SimLinkTransmissionEvent) => void
  >();
  private readonly topologyListeners = new Set<() => void>();

  private edgeKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  public getRadioRange(): number {
    return this.radioRange;
  }

  public setRadioRange(range: number): void {
    this.radioRange = Math.max(80, Math.min(800, range));
    this.recomputeNeighborhoods();
  }

  public getLatencyMs(): number {
    return this.latencyMs;
  }

  public setLatencyMs(ms: number): void {
    this.latencyMs = Math.max(0, Math.min(2000, ms));
    this.notifyTopologyChanged();
  }

  public getPacketLossPct(): number {
    return this.packetLossPct;
  }

  public setPacketLossPct(pct: number): void {
    this.packetLossPct = Math.max(0, Math.min(90, pct));
    this.notifyTopologyChanged();
  }

  public registerNode(
    transport: SimTransport,
    x: number,
    y: number,
    batteryPct = 88
  ): void {
    this.nodes.set(transport.nodeId, transport);
    this.positions.set(transport.nodeId, {
      nodeId: transport.nodeId,
      displayName: transport.displayName,
      x,
      y,
      online: true,
      batteryPct,
    });
    this.recomputeNeighborhoods();
  }

  public unregisterNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.positions.delete(nodeId);
    this.recomputeNeighborhoods();
  }

  public setNodePosition(nodeId: string, x: number, y: number): void {
    const pos = this.positions.get(nodeId);
    if (!pos) return;
    pos.x = Math.max(40, Math.min(960, x));
    pos.y = Math.max(40, Math.min(560, y));
    this.recomputeNeighborhoods();
  }

  public setNodeOnline(nodeId: string, online: boolean): void {
    const pos = this.positions.get(nodeId);
    if (!pos) return;
    pos.online = online;
    this.recomputeNeighborhoods();
  }

  public setLinkBlocked(nodeA: string, nodeB: string, blocked: boolean): void {
    const key = this.edgeKey(nodeA, nodeB);
    if (blocked) {
      this.blockedEdges.add(key);
    } else {
      this.blockedEdges.delete(key);
    }
    this.recomputeNeighborhoods();
  }

  public isLinkBlocked(nodeA: string, nodeB: string): boolean {
    return this.blockedEdges.has(this.edgeKey(nodeA, nodeB));
  }

  public getNodes(): SimNodePosition[] {
    return Array.from(this.positions.values());
  }

  public getAllLinks(): SimLinkState[] {
    const list: SimLinkState[] = [];
    const entries = Array.from(this.positions.values());
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const inRange = dist <= this.radioRange;
        const manuallyBlocked = this.isLinkBlocked(a.nodeId, b.nodeId);
        const active = a.online && b.online && inRange && !manuallyBlocked;
        const ratio = Math.min(1, dist / Math.max(1, this.radioRange));
        const linkQuality = active ? Math.max(15, Math.round((1 - ratio * 0.7) * 100)) : 0;
        const rssi = active ? Math.round(-45 - ratio * 42) : -100;

        list.push({
          nodeA: a.nodeId,
          nodeB: b.nodeId,
          distance: Math.round(dist),
          inRange,
          manuallyBlocked,
          active,
          rssi,
          linkQuality,
        });
      }
    }
    return list;
  }

  public getActiveNeighborsFor(nodeId: string): TransportPeerSummary[] {
    const posA = this.positions.get(nodeId);
    if (!posA || !posA.online) return [];

    const neighbors: TransportPeerSummary[] = [];
    for (const [otherId, posB] of this.positions.entries()) {
      if (otherId === nodeId || !posB.online) continue;
      if (this.isLinkBlocked(nodeId, otherId)) continue;
      const dist = Math.hypot(posA.x - posB.x, posA.y - posB.y);
      if (dist <= this.radioRange) {
        const ratio = Math.min(1, dist / Math.max(1, this.radioRange));
        const linkQuality = Math.max(15, Math.round((1 - ratio * 0.7) * 100));
        const rssi = Math.round(-45 - ratio * 42);
        neighbors.push({
          peerId: otherId,
          displayName: posB.displayName,
          rssi,
          linkQuality,
        });
      }
    }
    return neighbors;
  }

  public recomputeNeighborhoods(): void {
    for (const [nodeId, transport] of this.nodes.entries()) {
      transport.syncNeighborhood(this.getActiveNeighborsFor(nodeId));
    }
    this.notifyTopologyChanged();
  }

  public transmit(fromId: string, toId: string, bytes: Uint8Array): Promise<boolean> {
    return new Promise((resolve) => {
      const neighbors = this.getActiveNeighborsFor(fromId);
      const isReachable = neighbors.some((n) => n.peerId === toId);
      if (!isReachable) {
        resolve(false);
        return;
      }

      const target = this.nodes.get(toId);
      if (!target || !target.isStarted()) {
        resolve(false);
        return;
      }

      const dropped =
        this.packetLossPct > 0 && Math.random() * 100 < this.packetLossPct;

      let packetType = 'PACKET';
      let packetId = '';
      let priority = 2;
      try {
        const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
          type?: string;
          id?: string;
          prio?: number;
        };
        if (parsed.type) packetType = parsed.type;
        if (parsed.id) packetId = parsed.id;
        if (typeof parsed.prio === 'number') priority = parsed.prio;
      } catch {
        // binary payload
      }

      const txEvent: SimLinkTransmissionEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fromId,
        toId,
        packetType,
        packetId,
        priority,
        timestamp: Date.now(),
        dropped,
      };
      for (const cb of this.transmissionListeners) {
        cb(txEvent);
      }

      if (dropped) {
        resolve(false);
        return;
      }

      const copy = new Uint8Array(bytes);
      if (this.latencyMs <= 0) {
        target.deliverFromWire(fromId, copy);
        resolve(true);
      } else {
        setTimeout(() => {
          // Verify link is still active upon arrival
          const stillReachable = this.getActiveNeighborsFor(fromId).some(
            (n) => n.peerId === toId
          );
          if (stillReachable && target.isStarted()) {
            target.deliverFromWire(fromId, copy);
            resolve(true);
          } else {
            resolve(false);
          }
        }, this.latencyMs);
      }
    });
  }

  public onTransmission(
    cb: (ev: SimLinkTransmissionEvent) => void
  ): () => void {
    this.transmissionListeners.add(cb);
    return () => this.transmissionListeners.delete(cb);
  }

  public onTopologyChange(cb: () => void): () => void {
    this.topologyListeners.add(cb);
    return () => this.topologyListeners.delete(cb);
  }

  private notifyTopologyChanged(): void {
    for (const cb of this.topologyListeners) {
      cb();
    }
  }
}

export class SimTransport implements Transport {
  public readonly transportName = 'sim' as const;
  public readonly nodeId: string;
  public readonly displayName: string;
  private readonly controller: SimNetworkController;
  private started = false;
  private knownPeers = new Map<string, TransportPeerSummary>();
  private readonly peerListeners = new Set<PeerEventCallback>();
  private readonly packetListeners = new Set<PacketReceivedCallback>();

  constructor(
    nodeId: string,
    displayName: string,
    controller: SimNetworkController,
    x: number,
    y: number
  ) {
    this.nodeId = nodeId;
    this.displayName = displayName;
    this.controller = controller;
    this.controller.registerNode(this, x, y);
  }

  public isStarted(): boolean {
    return this.started;
  }

  public async start(): Promise<void> {
    this.started = true;
    this.syncNeighborhood(this.controller.getActiveNeighborsFor(this.nodeId));
  }

  public async stop(): Promise<void> {
    this.started = false;
    for (const peerId of this.knownPeers.keys()) {
      for (const cb of this.peerListeners) {
        cb({ peerId, status: 'lost' });
      }
    }
    this.knownPeers.clear();
  }

  public async send(peerId: string, bytes: Uint8Array): Promise<boolean> {
    if (!this.started) return false;
    return this.controller.transmit(this.nodeId, peerId, bytes);
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
    return Array.from(this.knownPeers.values());
  }

  public syncNeighborhood(nextPeers: TransportPeerSummary[]): void {
    if (!this.started) return;
    const nextMap = new Map<string, TransportPeerSummary>();
    for (const p of nextPeers) {
      nextMap.set(p.peerId, p);
    }

    // Check lost peers
    for (const [oldId] of this.knownPeers.entries()) {
      if (!nextMap.has(oldId)) {
        this.knownPeers.delete(oldId);
        for (const cb of this.peerListeners) {
          cb({ peerId: oldId, status: 'lost' });
        }
      }
    }

    // Check newly found peers
    for (const [newId, summary] of nextMap.entries()) {
      const existed = this.knownPeers.has(newId);
      this.knownPeers.set(newId, summary);
      if (!existed) {
        for (const cb of this.peerListeners) {
          cb({
            peerId: newId,
            displayName: summary.displayName,
            status: 'found',
            rssi: summary.rssi,
            linkQuality: summary.linkQuality,
          });
        }
      }
    }
  }

  public deliverFromWire(fromPeerId: string, bytes: Uint8Array): void {
    if (!this.started) return;
    for (const cb of this.packetListeners) {
      cb(fromPeerId, bytes);
    }
  }
}
