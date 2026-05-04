import { uint8ArrayToArrayBuffer } from '~/lib/asyncUtils';

export interface ChallengeComponents {
  version: number;
  zkTlsProof: Uint8Array;
  origin: string;
  controlCode: string;
  sessionNonce: Uint8Array;
}

export interface ChallengeDerivationInput {
  zkTlsProof: Uint8Array;
  origin: string;
  controlCode: string;
  sessionNonce: Uint8Array;
}

const VERSION = 0x01;
const CONTROL_CODE_LENGTH = 0x04;
const NONCE_LENGTH = 32;
const MAX_PROOF_LENGTH = 4096;
const PADDING_BLOCK = 32;

function computePaddingLength(currentLength: number): number {
  const remainder = currentLength % PADDING_BLOCK;
  if (remainder === 0) return 0;
  return PADDING_BLOCK - remainder;
}

export function serializeChallengeComponents(input: ChallengeDerivationInput): Uint8Array {
  const originBytes = new TextEncoder().encode(input.origin);
  const proofBytes = input.zkTlsProof;
  const controlCodeBytes = new TextEncoder().encode(input.controlCode);
  const nonce = input.sessionNonce;

  if (proofBytes.length > MAX_PROOF_LENGTH) {
    throw new Error(`zkTLS proof exceeds maximum length of ${MAX_PROOF_LENGTH} bytes`);
  }
  if (controlCodeBytes.length !== 4) {
    throw new Error('Control code must be exactly 4 ASCII digits');
  }
  if (nonce.length !== NONCE_LENGTH) {
    throw new Error(`Session nonce must be exactly ${NONCE_LENGTH} bytes`);
  }

  const headerSize = 1 + 2 + 2 + 1 + NONCE_LENGTH;
  const variableSize = proofBytes.length + originBytes.length + controlCodeBytes.length;
  const prePaddingSize = headerSize + variableSize;
  const paddingLength = computePaddingLength(prePaddingSize);
  const totalSize = prePaddingSize + paddingLength;

  const serialized = new Uint8Array(totalSize);
  let offset = 0;

  serialized[offset] = VERSION;
  offset += 1;

  serialized[offset] = (proofBytes.length >> 8) & 0xff;
  serialized[offset + 1] = proofBytes.length & 0xff;
  offset += 2;
  serialized.set(proofBytes, offset);
  offset += proofBytes.length;

  serialized[offset] = (originBytes.length >> 8) & 0xff;
  serialized[offset + 1] = originBytes.length & 0xff;
  offset += 2;
  serialized.set(originBytes, offset);
  offset += originBytes.length;

  serialized[offset] = CONTROL_CODE_LENGTH;
  offset += 1;
  serialized.set(controlCodeBytes, offset);
  offset += controlCodeBytes.length;

  serialized.set(nonce, offset);
  offset += NONCE_LENGTH;

  for (let i = 0; i < paddingLength; i++) {
    serialized[offset + i] = 0;
  }

  return serialized;
}

export function parseChallengeComponents(serialized: Uint8Array): ChallengeComponents {
  let offset = 0;

  const version = serialized[offset];
  if (version === undefined) throw new Error('Truncated: missing version byte');
  if (version !== VERSION) {
    throw new Error(`Unsupported challenge version: ${version}`);
  }
  offset += 1;

  if (offset + 2 > serialized.length) {
    throw new Error('Truncated: missing zkTLS proof length');
  }
  const proofLength = (serialized[offset]! << 8) | serialized[offset + 1]!;
  offset += 2;

  if (offset + proofLength > serialized.length) {
    throw new Error('Truncated: zkTLS proof exceeds available data');
  }
  const zkTlsProof = serialized.slice(offset, offset + proofLength);
  offset += proofLength;

  if (offset + 2 > serialized.length) {
    throw new Error('Truncated: missing origin length');
  }
  const originLength = (serialized[offset]! << 8) | serialized[offset + 1]!;
  offset += 2;

  if (offset + originLength > serialized.length) {
    throw new Error('Truncated: origin exceeds available data');
  }
  const originBytes = serialized.slice(offset, offset + originLength);
  const origin = new TextDecoder().decode(originBytes);
  offset += originLength;

  const controlCodeLength = serialized[offset];
  if (controlCodeLength === undefined || controlCodeLength !== 4) {
    throw new Error('Invalid control code length');
  }
  offset += 1;

  if (offset + 4 > serialized.length) {
    throw new Error('Truncated: control code exceeds available data');
  }
  const controlCode = new TextDecoder().decode(serialized.slice(offset, offset + 4));
  offset += 4;

  if (offset + NONCE_LENGTH > serialized.length) {
    throw new Error('Truncated: session nonce exceeds available data');
  }
  const sessionNonce = serialized.slice(offset, offset + NONCE_LENGTH);

  return {
    version: version!,
    zkTlsProof,
    origin,
    controlCode,
    sessionNonce,
  };
}

export async function deriveChallenge(input: ChallengeDerivationInput): Promise<Uint8Array> {
  const serialized = serializeChallengeComponents(input);
  const hash = await crypto.subtle.digest('SHA-256', uint8ArrayToArrayBuffer(serialized));
  return new Uint8Array(hash);
}

export function generateSessionNonce(): Uint8Array {
  const nonce = new Uint8Array(NONCE_LENGTH);
  crypto.getRandomValues(nonce);
  return nonce;
}
