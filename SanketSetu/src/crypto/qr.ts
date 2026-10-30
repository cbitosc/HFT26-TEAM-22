/**
 * Offline Contact Verification & QR Payload Codec (src/crypto/qr.ts)
 * Encodes/decodes peer identity URIs (`sanket://trust?...`) for scan-to-trust verification
 * and detects TOFU (Trust On First Use) public key changes.
 */

import { TrustStatus } from '../mesh/types';
import { computeSha256LikeHex, deriveNodeIdFromPublicKey, base64ToBytes } from './identity';

export interface TrustQrPayload {
  nodeId: string;
  displayName: string;
  signPub: string;
  boxPub: string;
  safeCircleKey?: string;
}

export function encodeTrustQrUri(payload: TrustQrPayload): string {
  const params = new URLSearchParams();
  params.set('id', payload.nodeId);
  params.set('name', payload.displayName);
  params.set('sp', payload.signPub);
  params.set('bp', payload.boxPub);
  if (payload.safeCircleKey) {
    params.set('ck', payload.safeCircleKey);
  }
  return `sanket://trust?${params.toString()}`;
}

export function decodeTrustQrUri(uri: string): TrustQrPayload | null {
  try {
    const trimmed = uri.trim();
    if (!trimmed.startsWith('sanket://trust?')) return null;
    const query = trimmed.slice('sanket://trust?'.length);
    const params = new URLSearchParams(query);
    const nodeId = params.get('id');
    const displayName = params.get('name');
    const signPub = params.get('sp');
    const boxPub = params.get('bp');
    if (!nodeId || !displayName || !signPub || !boxPub) return null;

    const derived = deriveNodeIdFromPublicKey(base64ToBytes(signPub));
    if (derived !== nodeId.toUpperCase()) {
      return null;
    }

    const safeCircleKey = params.get('ck') || undefined;
    return {
      nodeId: derived,
      displayName,
      signPub,
      boxPub,
      safeCircleKey,
    };
  } catch {
    return null;
  }
}

/**
 * Evaluates TOFU (Trust On First Use) status when a peer's HELLO or QR is received.
 */
export function evaluatePeerTrust(
  existingPeer: { signPub: string; boxPub: string; trustStatus: TrustStatus } | undefined,
  incomingSignPub: string,
  incomingBoxPub: string,
  verifiedViaQr = false
): TrustStatus {
  if (!existingPeer) {
    return verifiedViaQr ? 'verified' : 'unverified';
  }
  if (
    existingPeer.signPub !== incomingSignPub ||
    existingPeer.boxPub !== incomingBoxPub
  ) {
    return 'key_changed';
  }
  return verifiedViaQr ? 'verified' : existingPeer.trustStatus;
}

/**
 * Generates a deterministic 21x21 boolean matrix from a URI string for offline visual QR rendering.
 */
export function generateDeterministicQrMatrix(uri: string, size = 21): boolean[][] {
  const hashHex = computeSha256LikeHex(uri) + computeSha256LikeHex(uri + ':salt2');
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[r0 + r][c0 + c] = isBorder || isCenter;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      if (inTopLeft || inTopRight || inBottomLeft) continue;

      const hexChar = hashHex[bitIdx % hashHex.length];
      const nibble = parseInt(hexChar, 16);
      matrix[r][c] = ((nibble >> (bitIdx % 4)) & 1) === 1;
      bitIdx++;
    }
  }

  return matrix;
}
