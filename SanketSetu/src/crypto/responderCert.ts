/**
 * Verified Responder Certificates & Demo Authority (src/crypto/responderCert.ts)
 * Per §5 & §9.5:
 * - A responder enrolls by scanning an Authority QR containing a signed responder certificate.
 * - Authority public key is trusted by the app; for the hackathon demo, we derive a deterministic
 *   Ed25519 Demo Authority keypair and explicitly label it "DEMO AUTHORITY".
 * - The certificate also carries the Responder Group X25519 secret key used to open sealed precise
 *   SOS coordinates (`src/crypto/sealedLocation.ts`).
 * - `SOS_ACK` packets carrying a valid certificate display a verified ✔ badge; forged or tampered
 *   certificates are cryptographically rejected.
 */

import nacl from 'tweetnacl';
import {
  base64ToBytes,
  bytesToBase64,
  utf8ToBytes,
} from './identity';

export type ResponderRole =
  | 'NDRF_MEDIC'
  | 'FIRE_RESCUE'
  | 'CIVIL_DEFENSE'
  | 'INCIDENT_COMMAND';

export interface ResponderCertificate {
  v: 1;
  issuerLabel: 'DEMO AUTHORITY (NDRF / SDRF TESTNET)';
  issuerSignPubB64: string;
  subjectNodeId: string;
  subjectSignPubB64: string;
  subjectDisplayName: string;
  role: ResponderRole | string;
  organizationName: string;
  issuedAt: number;
  expiresAt: number;
  /** Shared X25519 secret key allowing certified responders to unseal precise SOS coordinates */
  responderGroupBoxSecretB64: string;
  /** Ed25519 signature by the Authority over the canonical fields */
  authoritySigB64: string;
}

export interface DemoAuthorityBundle {
  authoritySignPublicKeyB64: string;
  authoritySignSecretKeyB64: string;
  responderGroupBoxPublicKeyB64: string;
  responderGroupBoxSecretKeyB64: string;
}

let cachedDemoAuthority: DemoAuthorityBundle | null = null;

/**
 * Deterministically derives the Demo Authority Ed25519 keypair and Responder Group X25519 keypair
 * so all local & simulated nodes share the same trusted Demo Authority public key.
 */
export function getDemoAuthorityBundle(): DemoAuthorityBundle {
  if (cachedDemoAuthority) return cachedDemoAuthority;

  const authSeed = nacl
    .hash(utf8ToBytes('SANKET-SETU-DEMO-AUTHORITY-ED25519-SEED-V1'))
    .slice(0, 32);
  const authSignKp = nacl.sign.keyPair.fromSeed(authSeed);

  const groupSeed = nacl
    .hash(utf8ToBytes('SANKET-SETU-RESPONDER-GROUP-X25519-SEED-V1'))
    .slice(0, 32);
  const groupBoxKp = nacl.box.keyPair.fromSecretKey(groupSeed);

  cachedDemoAuthority = {
    authoritySignPublicKeyB64: bytesToBase64(authSignKp.publicKey),
    authoritySignSecretKeyB64: bytesToBase64(authSignKp.secretKey),
    responderGroupBoxPublicKeyB64: bytesToBase64(groupBoxKp.publicKey),
    responderGroupBoxSecretKeyB64: bytesToBase64(groupBoxKp.secretKey),
  };
  return cachedDemoAuthority;
}

export function getDemoAuthorityPublicKeyB64(): string {
  return getDemoAuthorityBundle().authoritySignPublicKeyB64;
}

function getCanonicalCertBytes(
  cert: Omit<ResponderCertificate, 'authoritySigB64'>
): Uint8Array {
  const canonical = JSON.stringify([
    cert.v,
    cert.issuerLabel,
    cert.issuerSignPubB64,
    cert.subjectNodeId,
    cert.subjectSignPubB64,
    cert.subjectDisplayName,
    cert.role,
    cert.organizationName,
    cert.issuedAt,
    cert.expiresAt,
    cert.responderGroupBoxSecretB64,
  ]);
  return utf8ToBytes(canonical);
}

/**
 * Issues a signed Responder Certificate from the Demo Authority (or a custom authority secret key).
 */
export function issueResponderCertificate(params: {
  subjectNodeId: string;
  subjectSignPubB64?: string;
  subjectDisplayName: string;
  role?: ResponderRole | string;
  organizationName?: string;
  validityMs?: number;
  customAuthoritySecretKeyB64?: string;
}): ResponderCertificate {
  const bundle = getDemoAuthorityBundle();
  const secretKeyBytes = base64ToBytes(
    params.customAuthoritySecretKeyB64 ?? bundle.authoritySignSecretKeyB64
  );

  const now = Date.now();
  const unsigned: Omit<ResponderCertificate, 'authoritySigB64'> = {
    v: 1,
    issuerLabel: 'DEMO AUTHORITY (NDRF / SDRF TESTNET)',
    issuerSignPubB64: bundle.authoritySignPublicKeyB64,
    subjectNodeId: params.subjectNodeId.toUpperCase(),
    subjectSignPubB64: params.subjectSignPubB64 ?? '',
    subjectDisplayName: params.subjectDisplayName.trim() || 'Responder',
    role: params.role?.trim() || 'NDRF_MEDIC',
    organizationName:
      params.organizationName?.trim() || 'NDRF Field Unit (DEMO AUTHORITY)',
    issuedAt: now,
    expiresAt: now + (params.validityMs ?? 7 * 24 * 60 * 60 * 1000),
    responderGroupBoxSecretB64: bundle.responderGroupBoxSecretKeyB64,
  };

  const sig = nacl.sign.detached(getCanonicalCertBytes(unsigned), secretKeyBytes);
  return {
    ...unsigned,
    authoritySigB64: bytesToBase64(sig),
  };
}

export interface CertVerificationResult {
  valid: boolean;
  role?: string;
  organizationName?: string;
  reason?: string;
}

/**
 * Verifies a ResponderCertificate against the trusted Authority public key and checks node binding + expiry.
 */
export function verifyResponderCertificate(
  cert: ResponderCertificate | undefined | null,
  expectedResponderNodeId?: string,
  now = Date.now()
): CertVerificationResult {
  if (!cert || cert.v !== 1) {
    return { valid: false, reason: 'No certificate attached' };
  }
  try {
    const bundle = getDemoAuthorityBundle();
    if (cert.issuerSignPubB64 !== bundle.authoritySignPublicKeyB64) {
      return { valid: false, reason: 'Untrusted authority issuer public key' };
    }
    if (
      expectedResponderNodeId &&
      cert.subjectNodeId.toUpperCase() !== expectedResponderNodeId.toUpperCase()
    ) {
      return {
        valid: false,
        reason: 'Certificate subjectNodeId does not match packet sender',
      };
    }
    if (now > cert.expiresAt) {
      return { valid: false, reason: 'Certificate expired' };
    }

    const pubBytes = base64ToBytes(bundle.authoritySignPublicKeyB64);
    const sigBytes = base64ToBytes(cert.authoritySigB64);
    if (sigBytes.length !== nacl.sign.signatureLength) {
      return { valid: false, reason: 'Invalid authority signature length' };
    }

    const ok = nacl.sign.detached.verify(
      getCanonicalCertBytes(cert),
      sigBytes,
      pubBytes
    );
    if (!ok) {
      return {
        valid: false,
        reason: 'Ed25519 authority signature verification failed',
      };
    }
    return {
      valid: true,
      role: cert.role,
      organizationName: cert.organizationName,
    };
  } catch {
    return { valid: false, reason: 'Malformed responder certificate' };
  }
}

export function encodeResponderCertQrUri(cert: ResponderCertificate): string {
  const b64 = bytesToBase64(utf8ToBytes(JSON.stringify(cert)));
  return `sanket://responder-cert?data=${encodeURIComponent(b64)}`;
}

export function decodeResponderCertQrUri(
  uri: string
): ResponderCertificate | null {
  try {
    const trimmed = uri.trim();
    if (!trimmed.startsWith('sanket://responder-cert?')) return null;
    const params = new URLSearchParams(
      trimmed.slice('sanket://responder-cert?'.length)
    );
    const dataB64 = params.get('data');
    if (!dataB64) return null;
    const jsonStr = new TextDecoder().decode(base64ToBytes(dataB64));
    const cert = JSON.parse(jsonStr) as ResponderCertificate;
    return cert;
  } catch {
    return null;
  }
}
