import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('~/lib/retry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/retry')>();
  return {
    ...actual,
    withRetry: vi.fn(async (fn: () => Promise<unknown>) => {
      try {
        const data = await fn();
        return { success: true, data, attempts: 1, totalTimeMs: 0 };
      } catch (err) {
        return { success: false, error: String(err), attempts: 1, totalTimeMs: 0 };
      }
    }),
  };
});

const mockUsbConnect = vi.fn().mockRejectedValue(new Error('USB not available'));
const mockUsbCheckAvailability = vi.fn().mockResolvedValue(false);
const mockUsbOnDisconnect = vi.fn();

vi.mock('./UsbTransport', () => {
  return {
    UsbTransport: class {
      type = 'usb' as const;
      connect = mockUsbConnect;
      disconnect = vi.fn();
      send = vi.fn();
      onMessage = vi.fn();
      onDisconnect = mockUsbOnDisconnect;
      getLatency = vi.fn().mockResolvedValue(50);
      isAvailable = vi.fn().mockReturnValue(false);
      checkAvailability = mockUsbCheckAvailability;
    },
  };
});

const mockWebRtcConnect = vi.fn().mockResolvedValue(undefined);
const mockWebRtcGetLatency = vi.fn().mockResolvedValue(120);
const mockWebRtcOnDisconnect = vi.fn();

vi.mock('./WebRtcTransport', () => {
  return {
    WebRtcTransport: class {
      type = 'webrtc' as const;
      connect = mockWebRtcConnect;
      disconnect = vi.fn();
      send = vi.fn();
      onMessage = vi.fn();
      onDisconnect = mockWebRtcOnDisconnect;
      getLatency = mockWebRtcGetLatency;
      isAvailable = vi.fn().mockReturnValue(true);
    },
  };
});

describe('TransportManager', () => {
  let TransportManager: typeof import('./TransportManager').TransportManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUsbConnect.mockRejectedValue(new Error('USB not available'));
    mockUsbCheckAvailability.mockResolvedValue(false);
    mockWebRtcConnect.mockResolvedValue(undefined);
    mockWebRtcGetLatency.mockResolvedValue(120);

    const mod = await import('./TransportManager');
    TransportManager = mod.TransportManager;
  });

  describe('selectTransport', () => {
    it('falls back to WebRTC when USB unavailable', async () => {
      const manager = new TransportManager();
      const transport = await manager.selectTransport();
      expect(transport.type).toBe('webrtc');
    });

    it('returns cached transport on second call', async () => {
      const manager = new TransportManager();
      const first = await manager.selectTransport();
      const second = await manager.selectTransport();
      expect(first).toBe(second);
    });

    it('throws when no transport available', async () => {
      mockWebRtcConnect.mockRejectedValue(new Error('WebRTC down'));

      const manager = new TransportManager();
      await expect(manager.selectTransport()).rejects.toThrow('No transport available');
    });

    it('deduplicates concurrent selectTransport calls', async () => {
      const manager = new TransportManager();
      const [first, second, third] = await Promise.all([
        manager.selectTransport(),
        manager.selectTransport(),
        manager.selectTransport(),
      ]);
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('allows retry after failed selectTransport', async () => {
      mockWebRtcConnect
        .mockRejectedValueOnce(new Error('WebRTC down'))
        .mockResolvedValueOnce(undefined);

      const manager = new TransportManager();
      await expect(manager.selectTransport()).rejects.toThrow('No transport available');

      const transport = await manager.selectTransport();
      expect(transport.type).toBe('webrtc');
    });
  });

  describe('monitorQuality', () => {
    it('reports healthy for low latency', async () => {
      const manager = new TransportManager();
      const transport = await manager.selectTransport();
      const result = await manager.monitorQuality(transport);
      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBe(120);
    });

    it('reports unhealthy for high latency', async () => {
      mockWebRtcGetLatency.mockResolvedValue(15000);

      const manager = new TransportManager();
      const transport = await manager.selectTransport();
      const result = await manager.monitorQuality(transport);
      expect(result.healthy).toBe(false);
      expect(result.latencyMs).toBe(15000);
    });

    it('reports unhealthy when getLatency throws', async () => {
      mockWebRtcGetLatency.mockRejectedValue(new Error('timeout'));

      const manager = new TransportManager();
      const transport = await manager.selectTransport();
      const result = await manager.monitorQuality(transport);
      expect(result.healthy).toBe(false);
      expect(result.latencyMs).toBe(-1);
    });
  });

  describe('retry integration', () => {
    it('delegates WebRTC connection retries to withRetry with correct options', async () => {
      const { withRetry, isRetryableError } = await import('~/lib/retry');
      const manager = new TransportManager();
      await manager.selectTransport();

      expect(withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxAttempts: 3,
          shouldRetry: isRetryableError,
        }),
      );
    });

    it('verifies isRetryableError accepts AbortError and rejects TypeError', async () => {
      const { isRetryableError } = await import('~/lib/retry');
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      expect(isRetryableError(abortError)).toBe(true);
      expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(false);
      expect(isRetryableError(Object.assign(new Error('server error'), { status: 503 }))).toBe(
        true,
      );
      expect(isRetryableError(Object.assign(new Error('bad request'), { status: 400 }))).toBe(
        false,
      );
    });
  });
});
