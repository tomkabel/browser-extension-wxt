import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCredentialsCreate = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      credentials: {
        create: mockCredentialsCreate,
      },
    },
    writable: true,
    configurable: true,
  });
});

describe('passkeyProvisioning', () => {
  it('creates credential with correct options structure', async () => {
    mockCredentialsCreate.mockImplementation(async ({ publicKey }: { publicKey: PublicKeyCredentialCreationOptions }) => {
      expect(publicKey.rp.id).toBe('extension.example.com');
      expect(publicKey.rp.name).toBe('SmartID2 Vault');
      expect(publicKey.pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }]);
      expect(publicKey.authenticatorSelection?.authenticatorAttachment).toBe('platform');
      expect(publicKey.authenticatorSelection?.userVerification).toBe('required');
      expect(publicKey.authenticatorSelection?.residentKey).toBe('required');
      expect(publicKey.timeout).toBe(60000);
      expect(publicKey.extensions).toBeDefined();
      expect((publicKey.extensions as Record<string, unknown>)?.prf).toBeDefined();

      return null;
    });

    const { createPasskeyCredential } = await import('../passkeyProvisioning');

    const result = await createPasskeyCredential('extension.example.com', 'SmartID2 Vault');

    expect(result.success).toBe(false);
  });

  it('returns credential data on success', async () => {
    const mockRawId = new Uint8Array(16).fill(0x30);

    const mockCredential = {
      rawId: mockRawId,
      id: btoa(String.fromCharCode(...mockRawId)),
      response: {
        getPublicKey: () => {
          const pk = new Uint8Array(65).fill(0x04);
          pk[0] = 0x04;
          return pk.buffer;
        },
      },
      getClientExtensionResults: () => ({
        prf: { enabled: true },
      }),
    };

    mockCredentialsCreate.mockResolvedValue(mockCredential);

    const { createPasskeyCredential } = await import('../passkeyProvisioning');

    const result = await createPasskeyCredential('extension.example.com', 'SmartID2 Vault');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.credentialId).toBeTypeOf('string');
      expect(result.credentialId.length).toBeGreaterThan(0);
      expect(result.rawId.length).toBe(16);
      expect(result.prfEnabled).toBe(true);
    }
  });

  it('handles null credential (cancelled)', async () => {
    mockCredentialsCreate.mockResolvedValue(null);

    const { createPasskeyCredential } = await import('../passkeyProvisioning');

    const result = await createPasskeyCredential('test.com', 'Test');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('cancelled');
    }
  });

  it('reads prfEnabled from getClientExtensionResults not credential.prf', async () => {
    const mockRawId = new Uint8Array(16).fill(0x30);

    const mockCredential = {
      rawId: mockRawId,
      id: btoa(String.fromCharCode(...mockRawId)),
      prf: { enabled: false },
      response: {
        getPublicKey: () => {
          const pk = new Uint8Array(65).fill(0x04);
          pk[0] = 0x04;
          return pk.buffer;
        },
      },
      getClientExtensionResults: () => ({
        prf: { enabled: true },
      }),
    };

    mockCredentialsCreate.mockResolvedValue(mockCredential);

    const { createPasskeyCredential } = await import('../passkeyProvisioning');

    const result = await createPasskeyCredential('example.com', 'Test');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.prfEnabled).toBe(true);
    }
  });

  it('handles missing getPublicKey gracefully', async () => {
    const mockRawId = new Uint8Array(16).fill(0x30);

    const mockCredential = {
      rawId: mockRawId,
      id: btoa(String.fromCharCode(...mockRawId)),
      response: {},
      getClientExtensionResults: () => ({}),
    };

    mockCredentialsCreate.mockResolvedValue(mockCredential);

    const { createPasskeyCredential } = await import('../passkeyProvisioning');

    const result = await createPasskeyCredential('example.com', 'Test');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Public key');
    }
  });
});
