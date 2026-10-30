/**
 * Transport Abstraction Interface (src/transport/Transport.ts)
 * Per §3:
 * Defines a clean transport contract implemented by:
 * 1. `NearbyTransport` (Android Google Nearby Connections P2P_CLUSTER)
 * 2. `SimTransport` (In-memory multi-node virtual mesh simulator)
 * 3. `LoopbackTransport` (Deterministic unit testing transport)
 */

export interface TransportPeerEvent {
  peerId: string;
  /** The phone's node id when the transport knows it (Nearby: from the endpoint name). */
  nodeId?: string;
  displayName?: string;
  status: 'found' | 'lost';
  rssi?: number;
  linkQuality?: number;
}

export interface TransportPeerSummary {
  peerId: string;
  /** Signed-identity node id of this neighbour when known. peerId is only a transport handle. */
  nodeId?: string;
  displayName: string;
  rssi: number;
  linkQuality: number;
}

export type PeerEventCallback = (event: TransportPeerEvent) => void | Promise<void>;
export type PacketReceivedCallback = (
  fromPeerId: string,
  bytes: Uint8Array,
  fromNodeId?: string
) => void | Promise<void>;

export interface Transport {
  readonly transportName: 'nearby' | 'sim' | 'loopback' | 'none';
  start(): Promise<void>;
  stop(): Promise<void>;
  send(peerId: string, bytes: Uint8Array): Promise<boolean>;
  onPeer(cb: PeerEventCallback): () => void;
  onPacket(cb: PacketReceivedCallback): () => void;
  getPeers(): TransportPeerSummary[];
}
