import { withTimeout, bufferToBase64 } from '~/lib/asyncUtils';

const PROVISIONING_TIMEOUT_MS = 60_000;
const PROVISIONING_WRAPPER_SLACK_MS = 10_000;

interface PrfExtensionResult {
  prf?: { enabled?: boolean };
}

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

function getPublicKeyFromResponse(response: AuthenticatorAttestationResponse): ArrayBuffer | null {
  if (typeof response.getPublicKey !== 'function') return null;
  const pk = response.getPublicKey();
  return pk ?? null;
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
          } as AuthenticationExtensionsClientInputs,
        },
      }) as Promise<PublicKeyCredential | null>,
      PROVISIONING_TIMEOUT_MS + PROVISIONING_WRAPPER_SLACK_MS,
      'Passkey creation timed out',
    )) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: 'Passkey creation cancelled' };
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const rawKey = getPublicKeyFromResponse(response);
    const publicKeyBytes = rawKey ? new Uint8Array(rawKey) : new Uint8Array(0);

    const extResults = (credential.getClientExtensionResults?.() ?? {}) as PrfExtensionResult;
    const prfEnabled = extResults.prf?.enabled === true;

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
  const rawKey = getPublicKeyFromResponse(response);
  if (!rawKey) {
    throw new Error('Public key not available from attestation response');
  }
  return new Uint8Array(rawKey);
}
