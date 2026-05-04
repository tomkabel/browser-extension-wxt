import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(),
      connectNative: vi.fn(),
    },
  },
}));

const { browser } = await import('wxt/browser');

describe('UsbTransport', () => {
  let UsbTransport: typeof import('./UsbTransport').UsbTransport;
  let transport: import('./UsbTransport').UsbTransport;

  beforeEach(async () => {
    vi.resetAllMocks();
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
    it('connects via offscreen relay on success', async () => {
      (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      await transport.connect();

      expect(transport.isAvailable()).toBe(true);
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'webrtc-connect-usb' }),
      );
    });

    it('throws on offscreen relay failure', async () => {
      (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'USB device not found',
      });

      await expect(transport.connect()).rejects.toThrow('USB device not found');
      expect(transport.isAvailable()).toBe(false);
    });
  });

  describe('send', () => {
    it('throws when not connected', async () => {
      await expect(transport.send(new Uint8Array([1, 2, 3]))).rejects.toThrow(
        'USB transport not connected',
      );
    });
  });

  describe('checkAvailability', () => {
    it('returns false when no WebUSB device enumerated', async () => {
      const available = await transport.checkAvailability();
      expect(available).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('cleans up state on disconnect', async () => {
      (browser.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      await transport.disconnect();
      expect(transport.isAvailable()).toBe(false);
    });
  });
});
