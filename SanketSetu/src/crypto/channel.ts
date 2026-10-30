/**
 * Shared Emergency Channel Encryption for SOS Broadcasts (src/crypto/channel.ts)
 * Per §5: SOS broadcasts must be readable by any nearby responder, so they are signed (Ed25519)
 * AND encrypted with a shared 32-byte mesh "emergency channel key" (XSalsa20-Poly1305 secretbox).
 * Default channel key is bundled for public disaster response; users can also set a custom
 * Safe-Circle channel key shared via QR code.
 */

import nacl from 'tweetnacl';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
} from './identity';
import { EncryptedPayloadResult } from './e2e';

const DEFAULT_EMERGENCY_PASSPHRASE = 'SANKET-PUBLIC-EMERGENCY-MESH-CHANNEL-V1';

/**
 * Derives a 32-byte XSalsa20-Poly1305 symmetric key from a channel passphrase or hex/base64 secret.
 */
export function deriveChannelKey(secretOrPassphrase?: string): Uint8Array {
  const normalized =
    secretOrPassphrase && secretOrPassphrase.trim().length > 0
      ? secretOrPassphrase.trim()
      : DEFAULT_EMERGENCY_PASSPHRASE;
  const hash = nacl.hash(utf8ToBytes(normalized));
  return hash.slice(0, nacl.secretbox.keyLength);
}

export function encryptChannelPayload<T>(
  cleartext: T,
  customChannelSecret?: string
): EncryptedPayloadResult {
  const key = deriveChannelKey(customChannelSecret);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const plaintext = utf8ToBytes(JSON.stringify(cleartext));
  const boxed = nacl.secretbox(plaintext, nonce, key);

  return {
    nonceB64: bytesToBase64(nonce),
    ciphertextB64: bytesToBase64(boxed),
  };
}

export function decryptChannelPayload<T>(
  ciphertextB64: string,
  nonceB64: string,
  customChannelSecret?: string
): T | null {
  try {
    const key = deriveChannelKey(customChannelSecret);
    const ciphertext = base64ToBytes(ciphertextB64);
    const nonce = base64ToBytes(nonceB64);
    if (nonce.length !== nacl.secretbox.nonceLength) return null;

    const opened = nacl.secretbox.open(ciphertext, nonce, key);
    if (!opened) return null;
    return JSON.parse(bytesToUtf8(opened)) as T;
  } catch {
    return null;
  }
}
