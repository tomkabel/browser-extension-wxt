import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCredentialsGet = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      credentials: {
        get: mockCredentialsGet,
      },
    },
    writable: true,
    configurable: true,
  });
});

describe('assertionRequest', () => {
  it('constructs proper PublicKeyCredentialRequestOptions structure', async () => {
    const challenge = new Uint8Array(32).fill(0x01);
    const allowCredentialId = new Uint8Array(16).fill(0x02);

    mockCredentialsGet.mockImplementation(async ({ publicKey }: { publicKey: PublicKeyCredentialRequestOptions }) => {
      expect(publicKey.challenge).toEqual(challenge);
      expect(publicKey.rpId).toBe('extension.example.com');
      expect(publicKey.userVerification).toBe('required');
      expect(publicKey.timeout).toBe(60000);
      expect(publicKey.allowCredentials).toBeDefined();
      expect(publicKey.allowCredentials).toHaveLength(1);
      expect(publicKey.allowCredentials![0]!.id).toEqual(allowCredentialId);
      expect(publicKey.allowCredentials![0]!.type).toBe('public-key');

      return null;
    });

    const { createAssertionRequest } = await import('../assertionRequest');

    const result = await createAssertionRequest({
      challenge,
      rpId: 'extension.example.com',
      allowCredentialId,
    });

    expect(result.success).toBe(false);
  });

  it('extracts assertion response data on success', async () => {
    const challenge = new Uint8Array(32).fill(0x01);

    const mockAuthenticatorData = new Uint8Array(37).fill(0x10);
    const mockSignature = new Uint8Array(64).fill(0x20);
    const mockClientDataJSON = new TextEncoder().encode(JSON.stringify({ challenge: 'test', origin: 'https://example.com' }));
    const mockRawId = new Uint8Array(16).fill(0x30);

    function copyBuffer(src: Uint8Array): ArrayBuffer {
      const dst = new Uint8Array(src.length);
      dst.set(src);
      return dst.buffer;
    }

    const mockAssertion = {
      rawId: mockRawId,
      id: btoa(String.fromCharCode(...mockRawId)),
      response: {
        authenticatorData: copyBuffer(mockAuthenticatorData),
        signature: copyBuffer(mockSignature),
        clientDataJSON: copyBuffer(mockClientDataJSON),
      },
      getClientExtensionResults: () => ({}),
    };

    mockCredentialsGet.mockResolvedValue(mockAssertion);

    const { createAssertionRequest } = await import('../assertionRequest');

    const result = await createAssertionRequest({
      challenge,
      rpId: 'extension.example.com',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.from(result.data.authenticatorData)).toEqual(Array.from(mockAuthenticatorData));
      expect(Array.from(result.data.signature)).toEqual(Array.from(mockSignature));
      expect(Array.from(result.data.clientDataJSON)).toEqual(Array.from(mockClientDataJSON));
      expect(Array.from(result.data.rawId)).toEqual(Array.from(mockRawId));
    }
  });

  it('returns error on null assertion', async () => {
    mockCredentialsGet.mockResolvedValue(null);

    const { createAssertionRequest } = await import('../assertionRequest');

    const result = await createAssertionRequest({
      challenge: new Uint8Array(32),
      rpId: 'test.com',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('cancelled');
    }
  });
});
