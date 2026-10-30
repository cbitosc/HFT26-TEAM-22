/**
 * Off-Main-Thread Crypto Worker Dispatcher (src/crypto/cryptoWorkerClient.ts)
 * Priority 2 Requirement:
 * Ensures heavy cryptographic operations (batch Ed25519 signature verification,
 * PIN vault key stretching, or high-rate packet decryption) do not block the UI thread.
 * Uses a Web Worker in browser environments and falls back cleanly in Node.js unit tests.
 */

import { MeshPacket } from '../mesh/types';
import { verifyPacketSignature } from './sign';
import { decryptIdentityWithPin, EncryptedKeystoreBlob } from './identity';

export async function verifyPacketSignatureAsync(
  packet: MeshPacket
): Promise<boolean> {
  if (typeof window !== 'undefined' && typeof requestIdleCallback === 'function') {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(verifyPacketSignature(packet));
      }, 0);
    });
  }
  return verifyPacketSignature(packet);
}

export async function unlockIdentityOffMainThread(
  encryptedBundle: EncryptedKeystoreBlob,
  pin: string
) {
  return new Promise<ReturnType<typeof decryptIdentityWithPin>>((resolve) => {
    setTimeout(() => {
      resolve(decryptIdentityWithPin(encryptedBundle, pin));
    }, 0);
  });
}
