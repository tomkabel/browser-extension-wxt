import { describe, it, expect, vi } from 'vitest';
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
        new Promise<USBInTransferResult>((_resolve, reject) => {
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

describe('WebUsbTransport + TransportManager failover', () => {
  it('satisfies the Transport interface contract', () => {
    const transport = new WebUsbTransport(makeMockAdapter());

    expect(transport.type).toBe('usb');
    expect(typeof transport.connect).toBe('function');
    expect(typeof transport.disconnect).toBe('function');
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.onMessage).toBe('function');
    expect(typeof transport.onDisconnect).toBe('function');
    expect(typeof transport.getLatency).toBe('function');
    expect(typeof transport.isAvailable).toBe('function');
    expect(typeof transport.checkAvailability).toBe('function');
  });

  it('checkAvailability reflects adapter state', async () => {
    const adapter = makeMockAdapter();
    const transport = new WebUsbTransport(adapter);

    (adapter.isAndroidDeviceAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    expect(await transport.checkAvailability()).toBe(false);

    (adapter.isAndroidDeviceAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    expect(await transport.checkAvailability()).toBe(true);
  });

  it('full cycle: connect → send → disconnect', async () => {
    const device = makeMockDevice();
    const transport = new WebUsbTransport(makeMockAdapter(device));

    await transport.connect();
    expect(transport.isAvailable()).toBe(true);

    await transport.send(new Uint8Array([1, 2, 3]));
    expect(device.transferOut).toHaveBeenCalled();

    await transport.disconnect();
    expect(transport.isAvailable()).toBe(false);
  });

  it('disconnect callback fires when USB read fails', async () => {
    const device = makeMockDevice({
      transferIn: vi.fn().mockRejectedValue(new Error('device lost')),
    });
    const transport = new WebUsbTransport(makeMockAdapter(device));

    const onDisconnect = vi.fn();
    transport.onDisconnect(onDisconnect);

    await transport.connect();

    await vi.waitFor(() => expect(onDisconnect).toHaveBeenCalled(), { timeout: 3000 });
    expect(transport.isAvailable()).toBe(false);
  });
});
