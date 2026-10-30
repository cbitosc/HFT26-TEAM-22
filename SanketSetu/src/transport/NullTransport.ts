/**
 * No-radio transport (src/transport/NullTransport.ts). Used in REAL mode when there is no native
 * radio (for example the browser build). It never finds peers and never sends, so REAL mode can
 * never show simulated phones by accident.
 */

import {
  PacketReceivedCallback,
  PeerEventCallback,
  Transport,
  TransportPeerSummary,
} from './Transport';

export class NullTransport implements Transport {
  public readonly transportName = 'none' as const;
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async send(): Promise<boolean> {
    return false;
  }
  onPeer(_cb: PeerEventCallback): () => void {
    return () => {};
  }
  onPacket(_cb: PacketReceivedCallback): () => void {
    return () => {};
  }
  getPeers(): TransportPeerSummary[] {
    return [];
  }
}
