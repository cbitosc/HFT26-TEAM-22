/**
 * Cryptographic Identity Management (src/crypto/identity.ts)
 * Generates Ed25519 signing keypairs and X25519 Diffie-Hellman keypairs using TweetNaCl.
 * Derives deterministic 8-character hex node ID fingerprints and supports PIN-derived encryption at rest.
 */

import nacl from 'tweetnacl';

export interface NodeIdentity {
  nodeId: string;
  displayName: string;
  signPublicKeyB64: string;
  signSecretKeyB64: string;
  boxPublicKeyB64: string;
  boxSecretKeyB64: string;
  createdAt: number;
}

export interface EncryptedKeystoreBlob {
  v: 1;
  saltB64: string;
  nonceB64: string;
  ciphertextB64: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Derives an 8-character uppercase hex Node ID from the SHA-512 hash of the Ed25519 public key.
 */
export function deriveNodeIdFromPublicKey(signPublicKey: Uint8Array): string {
  const digest = nacl.hash(signPublicKey);
  return bytesToHex(digest.slice(0, 4)).toUpperCase();
}

/**
 * Computes a 64-char hex SHA-512/256-like fingerprint for packet inspection and QR verification.
 */
export function computeSha256LikeHex(input: string | Uint8Array): string {
  const data = typeof input === 'string' ? utf8ToBytes(input) : input;
  const digest = nacl.hash(data);
  return bytesToHex(digest.slice(0, 32));
}

/**
 * Generates a fresh Ed25519 + X25519 identity for a Sanket node.
 */
export function generateNodeIdentity(displayName = 'SANKET-NODE'): NodeIdentity {
  const signKp = nacl.sign.keyPair();
  const boxKp = nacl.box.keyPair();
  const nodeId = deriveNodeIdFromPublicKey(signKp.publicKey);

  return {
    nodeId,
    displayName: displayName.trim() || `NODE-${nodeId.slice(0, 4)}`,
    signPublicKeyB64: bytesToBase64(signKp.publicKey),
    signSecretKeyB64: bytesToBase64(signKp.secretKey),
    boxPublicKeyB64: bytesToBase64(boxKp.publicKey),
    boxSecretKeyB64: bytesToBase64(boxKp.secretKey),
    createdAt: Date.now(),
  };
}

/**
 * Generates a random 16-byte packet ID as a 32-char lowercase hex string.
 */
export function generatePacketId(): string {
  return bytesToHex(nacl.randomBytes(16));
}

/**
 * Derives a 32-byte symmetric key from a user PIN and 16-byte salt using iterative SHA-512 stretching.
 */
export function derivePinKey(pin: string, salt: Uint8Array): Uint8Array {
  const pinBytes = utf8ToBytes(pin);
  let state: Uint8Array = new Uint8Array(pinBytes.length + salt.length);
  state.set(pinBytes, 0);
  state.set(salt, pinBytes.length);

  for (let i = 0; i < 2048; i++) {
    const roundInput = new Uint8Array(state.length + salt.length);
    roundInput.set(state, 0);
    roundInput.set(salt, state.length);
    state = nacl.hash(roundInput);
  }
  return state.slice(0, nacl.secretbox.keyLength);
}

/**
 * Encrypts a NodeIdentity at rest using a PIN-derived XSalsa20-Poly1305 secretbox key.
 */
export function encryptIdentityWithPin(
  identity: NodeIdentity,
  pin: string
): EncryptedKeystoreBlob {
  const salt = nacl.randomBytes(16);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const key = derivePinKey(pin, salt);
  const plaintext = utf8ToBytes(JSON.stringify(identity));
  const ciphertext = nacl.secretbox(plaintext, nonce, key);

  return {
    v: 1,
    saltB64: bytesToBase64(salt),
    nonceB64: bytesToBase64(nonce),
    ciphertextB64: bytesToBase64(ciphertext),
  };
}

/**
 * Decrypts an EncryptedKeystoreBlob with the user's PIN. Returns null if PIN is wrong or tampered.
 */
export function decryptIdentityWithPin(
  blob: EncryptedKeystoreBlob,
  pin: string
): NodeIdentity | null {
  try {
    const salt = base64ToBytes(blob.saltB64);
    const nonce = base64ToBytes(blob.nonceB64);
    const ciphertext = base64ToBytes(blob.ciphertextB64);
    const key = derivePinKey(pin, salt);
    const opened = nacl.secretbox.open(ciphertext, nonce, key);
    if (!opened) return null;
    return JSON.parse(bytesToUtf8(opened)) as NodeIdentity;
  } catch {
    return null;
  }
}
