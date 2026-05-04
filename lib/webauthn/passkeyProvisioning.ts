import { withTimeout } from '~/lib/asyncUtils';

const PROVISIONING_TIMEOUT_MS = 60_000;

export interface PasskeyCredentialResult {
  success: true;
  credentialId: string;
  rawId: Uint8Array;
  publicKeyBytes: Uint8Array;
  prfEnabled: boolean;
}

export interface PasskeyCredentialError {
  success: false;
  error: string;
}

export type PasskeyProvisioningOutcome = PasskeyCredentialResult | PasskeyCredentialError;

export interface ProvisionedCredentialData {
  credentialId: string;
  publicKeyBytes: number[];
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function createPasskeyCredential(
  rpId: string,
  rpName: string,
): Promise<PasskeyProvisioningOutcome> {
  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const prfSalt = new Uint8Array(32);
  crypto.getRandomValues(prfSalt);

  try {
    const credential = (await withTimeout(
      navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { id: rpId, name: rpName },
          user: {
            id: userId,
            name: 'smartid2-vault-user',
            displayName: 'SmartID Vault',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'required',
          },
          timeout: PROVISIONING_TIMEOUT_MS,
          extensions: {
            prf: { eval: { first: prfSalt } },
          } as Record<string, unknown>,
        },
      }) as Promise<PublicKeyCredential | null>,
      PROVISIONING_TIMEOUT_MS + 1000,
      'Passkey creation timed out',
    )) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: 'Passkey creation cancelled' };
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    const publicKeyBytes = new Uint8Array(
      response.getPublicKey?.() ?? response.getPublicKey() ?? new ArrayBuffer(0),
    );

    const credWithPrf = credential as { prf?: { enabled?: boolean }; getClientExtensionResults?: () => { prf?: { enabled?: boolean } } };
    const prfEnabled =
      (credWithPrf.prf?.enabled === true) ||
      (typeof credWithPrf.getClientExtensionResults === 'function' &&
        credWithPrf.getClientExtensionResults()?.prf?.enabled === true);

    return {
      success: true,
      credentialId: bufferToBase64(credential.rawId),
      rawId: new Uint8Array(credential.rawId),
      publicKeyBytes,
      prfEnabled,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export function extractPublicKeyBytes(
  credential: PublicKeyCredential,
): Uint8Array {
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey?.() ?? response.getPublicKey();
  if (!publicKey) {
    throw new Error('Public key not available from attestation response');
  }
  return new Uint8Array(publicKey);
}
