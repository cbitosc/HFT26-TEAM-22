/**
 * Ed25519 Packet Authentication (src/crypto/sign.ts)
 * Every packet on the Sanket mesh is signed by its origin node using Ed25519.
 * Relays and recipients verify the signature over immutable origin fields before accepting or forwarding.
 */

import nacl from 'tweetnacl';
import { MeshPacket } from '../mesh/types';
import {
  base64ToBytes,
  bytesToBase64,
  deriveNodeIdFromPublicKey,
  utf8ToBytes,
} from './identity';

/**
 * Produces a deterministic canonical string over all immutable origin fields of a MeshPacket.
 * Note: `ttl`, `hops`, and `route` mutate in transit across relays, so the signature covers
 * the immutable origin fields (`v, id, type, prio, src, srcSignPub, srcBoxPub, dst, ts, nonce, payload`).
 */
export function getCanonicalSignableBytes(
  packet: Omit<MeshPacket, 'sig' | 'ttl' | 'hops' | 'route'>
): Uint8Array {
  const canonical = JSON.stringify([
    packet.v,
    packet.id,
    packet.type,
    packet.prio,
    packet.src,
    packet.srcSignPub,
    packet.srcBoxPub,
    packet.dst,
    packet.ts,
    packet.nonce,
    packet.payload,
  ]);
  return utf8ToBytes(canonical);
}

/**
 * Signs a packet using the sender's 64-byte Ed25519 secret key (base64).
 */
export function signPacket(
  unsignedPacket: Omit<MeshPacket, 'sig'>,
  signSecretKeyB64: string
): string {
  const secretKey = base64ToBytes(signSecretKeyB64);
  const messageBytes = getCanonicalSignableBytes(unsignedPacket);
  const sigBytes = nacl.sign.detached(messageBytes, secretKey);
  return bytesToBase64(sigBytes);
}

/**
 * Verifies:
 * 1. `packet.src` matches the deterministic 8-char fingerprint of `packet.srcSignPub`.
 * 2. `packet.sig` is a valid Ed25519 detached signature over the canonical packet fields.
 */
export function verifyPacketSignature(packet: MeshPacket): boolean {
  try {
    const pubKeyBytes = base64ToBytes(packet.srcSignPub);
    if (pubKeyBytes.length !== nacl.sign.publicKeyLength) {
      return false;
    }

    const expectedNodeId = deriveNodeIdFromPublicKey(pubKeyBytes);
    if (expectedNodeId !== packet.src) {
      return false;
    }

    const sigBytes = base64ToBytes(packet.sig);
    if (sigBytes.length !== nacl.sign.signatureLength) {
      return false;
    }

    const messageBytes = getCanonicalSignableBytes(packet);
    return nacl.sign.detached.verify(messageBytes, sigBytes, pubKeyBytes);
  } catch {
    return false;
  }
}
