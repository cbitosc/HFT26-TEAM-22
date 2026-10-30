/**
 * Sealed Precise Location for SOS Broadcasts (src/crypto/sealedLocation.ts)
 * Per §5 & §9.2:
 * - SOS broadcasts are readable by nearby peers for coarse awareness,
 *   but EXACT GPS coordinates (`lat`, `lng`) are cryptographically sealed
 *   to the Responder Group X25519 public key using an ephemeral X25519 keypair + XSalsa20-Poly1305.
 * - Non-responder nodes can only see coarse area (~1km rounded coordinates) or disabled.
 * - Only certified responders holding a valid `ResponderCertificate` (which contains
 *   `responderGroupBoxSecretB64`) can unseal the exact coordinates!
 */

import nacl from 'tweetnacl';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
} from './identity';
import {
  getDemoAuthorityBundle,
  ResponderCertificate,
  verifyResponderCertificate,
} from './responderCert';

export interface SealedLocationEnvelope {
  ephemeralBoxPubB64: string;
  nonceB64: string;
  ciphertextB64: string;
}

export interface PreciseCoordinates {
  lat: number;
  lng: number;
  accuracyMeters: number;
  altitudeMeters?: number;
}

/**
 * Seals exact GPS coordinates to the Responder Group X25519 public key.
 */
export function sealPreciseLocation(
  coords: PreciseCoordinates,
  responderGroupPublicKeyB64?: string
): SealedLocationEnvelope {
  const groupPubB64 =
    responderGroupPublicKeyB64 ??
    getDemoAuthorityBundle().responderGroupBoxPublicKeyB64;
  const groupPubBytes = base64ToBytes(groupPubB64);

  const ephemeralKp = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const plaintext = utf8ToBytes(JSON.stringify(coords));

  const ciphertext = nacl.box(
    plaintext,
    nonce,
    groupPubBytes,
    ephemeralKp.secretKey
  );

  return {
    ephemeralBoxPubB64: bytesToBase64(ephemeralKp.publicKey),
    nonceB64: bytesToBase64(nonce),
    ciphertextB64: bytesToBase64(ciphertext),
  };
}

/**
 * Unseals exact GPS coordinates ONLY if the caller holds a valid, verified ResponderCertificate.
 * Returns null if the certificate is missing, forged, expired, or decryption fails.
 */
export function unsealPreciseLocation(
  envelope: SealedLocationEnvelope | undefined | null,
  responderCert: ResponderCertificate | undefined | null
): PreciseCoordinates | null {
  if (!envelope || !responderCert) return null;

  // Verify the responder certificate is authentic before using its group secret key
  const check = verifyResponderCertificate(responderCert);
  if (!check.valid) {
    return null;
  }

  try {
    const groupSecretBytes = base64ToBytes(
      responderCert.responderGroupBoxSecretB64
    );
    const ephemeralPubBytes = base64ToBytes(envelope.ephemeralBoxPubB64);
    const nonceBytes = base64ToBytes(envelope.nonceB64);
    const cipherBytes = base64ToBytes(envelope.ciphertextB64);

    const opened = nacl.box.open(
      cipherBytes,
      nonceBytes,
      ephemeralPubBytes,
      groupSecretBytes
    );
    if (!opened) return null;

    return JSON.parse(bytesToUtf8(opened)) as PreciseCoordinates;
  } catch {
    return null;
  }
}
