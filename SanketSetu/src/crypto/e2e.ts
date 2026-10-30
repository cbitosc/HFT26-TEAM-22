/**
 * End-to-End Encryption for Direct Messages (src/crypto/e2e.ts)
 * Uses X25519 ECDH key agreement + XSalsa20-Poly1305 authenticated encryption (`nacl.box`).
 * Fresh 24-byte random nonce generated for every message.
 * Intermediate mesh relays see only packet headers, never the plaintext payload.
 */

import nacl from 'tweetnacl';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
} from './identity';

export interface EncryptedPayloadResult {
  nonceB64: string;
  ciphertextB64: string;
}

/**
 * Encrypts a JSON-serializable cleartext object from sender (X25519 secretKey)
 * to recipient (X25519 publicKey).
 */
export function encryptDirectPayload<T>(
  cleartext: T,
  recipientBoxPublicKeyB64: string,
  senderBoxSecretKeyB64: string
): EncryptedPayloadResult {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const recipientPub = base64ToBytes(recipientBoxPublicKeyB64);
  const senderSec = base64ToBytes(senderBoxSecretKeyB64);
  const messageBytes = utf8ToBytes(JSON.stringify(cleartext));

  const boxed = nacl.box(messageBytes, nonce, recipientPub, senderSec);
  return {
    nonceB64: bytesToBase64(nonce),
    ciphertextB64: bytesToBase64(boxed),
  };
}

/**
 * Decrypts an E2E `nacl.box` payload at the final recipient node.
 * Returns null if this node is not the intended recipient or if authentication tag fails.
 */
export function decryptDirectPayload<T>(
  ciphertextB64: string,
  nonceB64: string,
  senderBoxPublicKeyB64: string,
  recipientBoxSecretKeyB64: string
): T | null {
  try {
    const ciphertext = base64ToBytes(ciphertextB64);
    const nonce = base64ToBytes(nonceB64);
    const senderPub = base64ToBytes(senderBoxPublicKeyB64);
    const recipientSec = base64ToBytes(recipientBoxSecretKeyB64);

    if (
      nonce.length !== nacl.box.nonceLength ||
      senderPub.length !== nacl.box.publicKeyLength ||
      recipientSec.length !== nacl.box.secretKeyLength
    ) {
      return null;
    }

    const opened = nacl.box.open(ciphertext, nonce, senderPub, recipientSec);
    if (!opened) return null;
    return JSON.parse(bytesToUtf8(opened)) as T;
  } catch {
    return null;
  }
}
