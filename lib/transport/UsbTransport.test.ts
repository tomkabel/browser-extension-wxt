import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      connectNative: vi.fn(),
    },
  },
}));

const mockPort = {
  postMessage: vi.fn(),
  disconnect: vi.fn(),
  onMessage: {
    addListener: vi.fn(),
  },
  onDisconnect: {
    addListener: vi.fn(),
  },
};

const { browser } = await import('wxt/browser');

describe('UsbTransport', () => {
  let UsbTransport: typeof import('./UsbTransport').UsbTransport;
  let transport: import('./UsbTransport').UsbTransport;

  beforeEach(async () => {
    vi.clearAllMocks();
    (browser.runtime.connectNative as ReturnType<typeof vi.fn>).mockReturnValue(mockPort);
    mockPort.postMessage.mockReset();
    const mod = await import('./UsbTransport');
    UsbTransport = mod.UsbTransport;
    transport = new UsbTransport();
  });

  describe('initial state', () => {
    it('has type "usb"', () => {
      expect(transport.type).toBe('usb');
    });

    it('is not available initially', () => {
      expect(transport.isAvailable()).toBe(false);
    });
  });

  describe('connect', () => {
    it('connects to native host and returns on success', async () => {
      mockPort.postMessage.mockResolvedValue(undefined);

      const connectPromise = transport.connect();

      const connectHandler = mockPort.onMessage.addListener.mock.calls[0]?.[0];
      expect(connectHandler).toBeDefined();

      const disconnectHandler = mockPort.onDisconnect.addListener.mock.calls[0]?.[0];
      expect(disconnectHandler).toBeDefined();

      const messageHandler = mockPort.onMessage.addListener.mock.calls[0]?.[0];
      if (messageHandler) {
        messageHandler({ id: 'req_1', success: true, type: 'connect' });
      }

      await connectPromise;
      expect(transport.isAvailable()).toBe(true);
    });

    it('throws on native host connect failure', async () => {
      mockPort.postMessage.mockResolvedValue(undefined);

      const connectPromise = transport.connect();

      const messageHandler = mockPort.onMessage.addListener.mock.calls[0]?.[0];
      if (messageHandler) {
        messageHandler({ id: 'req_1', success: false, error: 'USB device not found', type: 'connect' });
      }

      await expect(connectPromise).rejects.toThrow('USB device not found');
    });
  });

  describe('send', () => {
    it('throws when not connected', async () => {
      await expect(transport.send(new Uint8Array([1, 2, 3]))).rejects.toThrow('USB transport not connected');
    });
  });

  describe('checkAvailability', () => {
    it('returns false when port is not connected', async () => {
      const available = await transport.checkAvailability();
      expect(available).toBe(false);
    });
  });

  describe('onDisconnect callback', () => {
    it('fires onDisconnect when native host disconnects', async () => {
      mockPort.postMessage.mockResolvedValue(undefined);

      const connectPromise = transport.connect();
      const messageHandler = mockPort.onMessage.addListener.mock.calls[0]?.[0];
      if (messageHandler) {
        messageHandler({ id: 'req_1', success: true, type: 'connect' });
      }
      await connectPromise;

      const disconnectSpy = vi.fn();
      transport.onDisconnect(disconnectSpy);

      const addListenerCalls = mockPort.onDisconnect.addListener.mock.calls;
      expect(addListenerCalls.length).toBeGreaterThanOrEqual(1);

      const disconnectHandler = addListenerCalls[0]?.[0];
      if (disconnectHandler) {
        disconnectHandler();
      }
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('cleans up state on disconnect', async () => {
      mockPort.postMessage.mockResolvedValue(undefined);

      await transport.disconnect();
      expect(transport.isAvailable()).toBe(false);
    });
  });
});
