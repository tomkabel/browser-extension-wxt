import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const mockSend = vi.fn().mockResolvedValue(undefined);
const mockGetTransportManager = vi.fn();
const mockInitializeTransportManager = vi.fn().mockResolvedValue(undefined);

vi.mock('./messageHandlers', () => ({
  getTransportManager: mockGetTransportManager,
  initializeTransportManager: mockInitializeTransportManager,
}));

beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
});

describe('transmitCredentialToAndroid', () => {
  it('sends correct payload over transport (3.4)', async () => {
    mockGetTransportManager.mockReturnValue({ send: mockSend });

    const { transmitCredentialToAndroid } = await import('./pairingCoordinator');

    const credentialId = 'test-credential-id';
    const publicKeyBytes = new Uint8Array([1, 2, 3, 4, 5]);

    const result = await transmitCredentialToAndroid(credentialId, publicKeyBytes);

    expect(result).toBe(true);
    expect(mockInitializeTransportManager).toHaveBeenCalled();
    expect(mockGetTransportManager).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);

    const sentMessage = mockSend.mock.calls[0]![0] as Uint8Array;
    const decoded = JSON.parse(new TextDecoder().decode(sentMessage));
    expect(decoded.type).toBe('credential-provision');
    expect(decoded.credentialId).toBe(credentialId);
    expect(decoded.publicKeyBytes).toBe(
      btoa(String.fromCharCode(...Array.from(publicKeyBytes))),
    );
  });

  it('returns false when no transport is available', async () => {
    mockGetTransportManager.mockReturnValue(null);

    const { transmitCredentialToAndroid } = await import('./pairingCoordinator');

    const result = await transmitCredentialToAndroid(
      'test-id',
      new Uint8Array([1, 2, 3]),
    );

    expect(result).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns false on send failure', async () => {
    mockGetTransportManager.mockReturnValue({ send: vi.fn().mockRejectedValue(new Error('Transport error')) });

    const { transmitCredentialToAndroid } = await import('./pairingCoordinator');

    const result = await transmitCredentialToAndroid(
      'test-id',
      new Uint8Array([1, 2, 3]),
    );

    expect(result).toBe(false);
  });
});
