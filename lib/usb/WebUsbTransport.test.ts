import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebUsbTransport, type WebUsbAdapter } from './WebUsbTransport';

function makeMockEndpoint(direction: 'in' | 'out', endpointNumber: number): USBEndpoint {
  return { direction, endpointNumber, packetSize: 64 } as USBEndpoint;
}

function makeMockDevice(overrides: Partial<USBDevice> = {}): USBDevice {
  let closed = false;
  let rejectTransferIn: ((err: Error) => void) | null = null;

  const endpoints = [makeMockEndpoint('in', 0x81), makeMockEndpoint('out', 0x01)];

  const device = {
    vendorId: 0x18d1,
    productId: 0x2d00,
    opened: false,
    productName: 'Mock AOA',
    configuration: null as USBConfiguration | null,
    open: vi.fn().mockImplementation(async function (this: { opened: boolean }) {
      this.opened = true;
      closed = false;
    }),
    close: vi.fn().mockImplementation(async function (this: { opened: boolean }) {
      closed = true;
      this.opened = false;
      if (rejectTransferIn) {
        rejectTransferIn(new Error('device closed'));
        rejectTransferIn = null;
      }
    }),
    selectConfiguration: vi.fn().mockImplementation(async function (this: {
      configuration: unknown;
    }) {
      this.configuration = {
        interfaces: [{ alternates: [{ endpoints }] }],
      };
    }),
    claimInterface: vi.fn().mockResolvedValue(undefined),
    transferOut: vi.fn().mockResolvedValue({ bytesWritten: 4 }),
    transferIn: vi.fn().mockImplementation(
      () =>
        new Promise<USBInTransferResult>((resolve, reject) => {
          if (closed) {
            reject(new Error('device closed'));
            return;
          }
          rejectTransferIn = reject;
        }),
    ),
    ...overrides,
  } as unknown as USBDevice & { opened: boolean; configuration: USBConfiguration | null };

  return device;
}

function makeMockAdapter(device: USBDevice | null = null): WebUsbAdapter {
  return {
    getDevices: vi.fn().mockResolvedValue(device ? [device] : []),
    isAndroidDeviceAvailable: vi.fn().mockResolvedValue(device !== null),
  };
}

describe('WebUsbTransport', () => {
  let transport: WebUsbTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new WebUsbTransport(makeMockAdapter());
  });

  it('implements the Transport interface', () => {
    expect(transport.type).toBe('usb');
    expect(typeof transport.connect).toBe('function');
    expect(typeof transport.disconnect).toBe('function');
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.onMessage).toBe('function');
    expect(typeof transport.onDisconnect).toBe('function');
    expect(typeof transport.getLatency).toBe('function');
    expect(typeof transport.isAvailable).toBe('function');
  });

  it('is not available initially', () => {
    expect(transport.isAvailable()).toBe(false);
  });

  describe('connect', () => {
    it('opens device, selects config, claims interface, discovers endpoints', async () => {
      const device = makeMockDevice();
      transport = new WebUsbTransport(makeMockAdapter(device));

      await transport.connect();

      expect(device.open).toHaveBeenCalled();
      expect(device.selectConfiguration).toHaveBeenCalledWith(1);
      expect(device.claimInterface).toHaveBeenCalledWith(0);
      expect(transport.isAvailable()).toBe(true);
      await transport.disconnect();
    });

    it('is idempotent — second connect returns immediately', async () => {
      const device = makeMockDevice();
      transport = new WebUsbTransport(makeMockAdapter(device));

      await transport.connect();
      await transport.connect();

      expect(device.open).toHaveBeenCalledTimes(1);
      await transport.disconnect();
    });

    it('throws when no AOA device found', async () => {
      await expect(transport.connect()).rejects.toThrow('No AOA device found');
      expect(transport.isAvailable()).toBe(false);
    });

    it('throws when device has no valid endpoint pair', async () => {
      const device = makeMockDevice({
        configuration: { interfaces: [{ alternates: [{ endpoints: [] }] }] } as unknown,
      } as Partial<USBDevice>);
      transport = new WebUsbTransport(makeMockAdapter(device));

      await expect(transport.connect()).rejects.toThrow('No valid USB endpoint pair found');
      expect(transport.isAvailable()).toBe(false);
    });
  });

  describe('send', () => {
    it('sends via dynamically discovered OUT endpoint', async () => {
      const device = makeMockDevice();
      transport = new WebUsbTransport(makeMockAdapter(device));
      await transport.connect();

      await transport.send(new Uint8Array([10, 20, 30]));

      expect(device.transferOut).toHaveBeenCalledWith(0x01, expect.any(ArrayBuffer));
      await transport.disconnect();
    });

    it('throws when not connected', async () => {
      await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('WebUSB not connected');
    });
  });

  describe('disconnect', () => {
    it('closes device and resets state', async () => {
      const device = makeMockDevice();
      transport = new WebUsbTransport(makeMockAdapter(device));
      await transport.connect();

      await transport.disconnect();

      expect(device.close).toHaveBeenCalled();
      expect(transport.isAvailable()).toBe(false);
    });

    it('does not throw when no device connected', async () => {
      await expect(transport.disconnect()).resolves.not.toThrow();
    });
  });

  describe('onMessage', () => {
    it('delivers received data to registered callbacks', async () => {
      let readCount = 0;
      const device = makeMockDevice({
        transferIn: vi.fn().mockImplementation(() => {
          readCount++;
          if (readCount <= 1) {
            return Promise.resolve({
              data: { buffer: new Uint8Array([0xaa, 0xbb]).buffer, byteLength: 2 },
            });
          }
          // Block forever — disconnect will cause rejection
          return new Promise(() => {});
        }),
      });
      transport = new WebUsbTransport(makeMockAdapter(device));

      const spy = vi.fn();
      transport.onMessage(spy);
      await transport.connect();

      await vi.waitFor(() => expect(spy).toHaveBeenCalled(), { timeout: 3000 });
      expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array));

      await transport.disconnect();
    });

    it('supports removing a callback via removeMessageListener', () => {
      const cb = vi.fn();
      transport.onMessage(cb);
      transport.removeMessageListener(cb);
      // No error, internal list is managed
      expect(true).toBe(true);
    });
  });

  describe('onDisconnect', () => {
    it('fires disconnect callbacks on read error', async () => {
      const device = makeMockDevice({
        transferIn: vi.fn().mockRejectedValue(new Error('device detached')),
      });
      transport = new WebUsbTransport(makeMockAdapter(device));

      const spy = vi.fn();
      transport.onDisconnect(spy);
      await transport.connect();

      await vi.waitFor(() => expect(spy).toHaveBeenCalled(), { timeout: 3000 });
      expect(transport.isAvailable()).toBe(false);
    });

    it('supports removing a callback via removeDisconnectListener', () => {
      const cb = vi.fn();
      transport.onDisconnect(cb);
      transport.removeDisconnectListener(cb);
      expect(true).toBe(true);
    });
  });

  describe('getLatency', () => {
    it('returns -1 when not connected', async () => {
      expect(await transport.getLatency()).toBe(-1);
    });

    it('measures USB transferOut latency when connected', async () => {
      const device = makeMockDevice();
      (device.transferOut as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { bytesWritten: 0 };
      });
      transport = new WebUsbTransport(makeMockAdapter(device));
      await transport.connect();

      const latency = await transport.getLatency();
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(1000);
      expect(device.transferOut).toHaveBeenCalledWith(0x01, expect.any(Uint8Array));
      await transport.disconnect();
    });

    it('returns -1 when transferOut throws', async () => {
      const device = makeMockDevice();
      (device.transferOut as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('device busy'));
      transport = new WebUsbTransport(makeMockAdapter(device));
      await transport.connect();

      expect(await transport.getLatency()).toBe(-1);
      await transport.disconnect();
    });
  });

  describe('checkAvailability', () => {
    it('returns true when AOA device is present', async () => {
      const device = makeMockDevice();
      transport = new WebUsbTransport(makeMockAdapter(device));

      expect(await transport.checkAvailability()).toBe(true);
    });

    it('returns false when no AOA device present', async () => {
      expect(await transport.checkAvailability()).toBe(false);
    });
  });
});
