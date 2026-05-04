import { withTimeout } from '~/lib/asyncUtils';

const ASSERTION_TIMEOUT_MS = 60_000;

export interface AssertionRequestOptions {
  challenge: Uint8Array;
  rpId: string;
  allowCredentialId?: Uint8Array;
}

export interface AssertionResponseData {
  rawId: Uint8Array;
  credentialId: string;
  authenticatorData: Uint8Array;
  signature: Uint8Array;
  clientDataJSON: Uint8Array;
}

export interface AssertionRequestResult {
  success: true;
  data: AssertionResponseData;
}

export interface AssertionRequestError {
  success: false;
  error: string;
  timedOut: boolean;
}

export type AssertionRequestOutcome = AssertionRequestResult | AssertionRequestError;

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function createAssertionRequest(
  options: AssertionRequestOptions,
): Promise<AssertionRequestOutcome> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: options.challenge.buffer as ArrayBuffer,
    rpId: options.rpId,
    userVerification: 'required',
    timeout: ASSERTION_TIMEOUT_MS,
  };

  if (options.allowCredentialId) {
    publicKey.allowCredentials = [
      {
        id: options.allowCredentialId.buffer as ArrayBuffer,
        type: 'public-key',
        transports: ['internal', 'usb', 'nfc'],
      },
    ];
  }

  try {
    const assertion = (await withTimeout(
      navigator.credentials.get({ publicKey }) as Promise<PublicKeyCredential>,
      ASSERTION_TIMEOUT_MS + 1000,
      'Biometric verification timed out',
    )) as PublicKeyCredential | null;

    if (!assertion) {
      return { success: false, error: 'Biometric verification cancelled', timedOut: false };
    }

    const response = assertion.response as AuthenticatorAssertionResponse;

    return {
      success: true,
      data: {
        rawId: new Uint8Array(assertion.rawId),
        credentialId: bufferToBase64(assertion.rawId),
        authenticatorData: new Uint8Array(response.authenticatorData),
        signature: new Uint8Array(response.signature),
        clientDataJSON: new Uint8Array(response.clientDataJSON),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('timed out') || message.includes('Timed out');
    return {
      success: false,
      error: isTimeout ? 'Biometric verification timed out' : message,
      timedOut: isTimeout,
    };
  }
}
