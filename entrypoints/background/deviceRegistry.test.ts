import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

let deviceRegistry: typeof import('./deviceRegistry');

function createDevice(
  overrides: Partial<import('~/types').DeviceRecord> = {},
): import('~/types').DeviceRecord {
  return {
    deviceId: 'abcd1234efgh5678',
    name: 'Test Phone',
    phoneStaticKey: new Uint8Array([1, 2, 3, 4, 5]),
    lastSeen: Date.now(),
    pairedAt: Date.now(),
    isPrimary: true,
    ...overrides,
  };
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.resetModules();
  deviceRegistry = await import('./deviceRegistry');
});

describe('deviceRegistry - addDevice', () => {
  it('adds a device and persists to session', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);

    const devices = await deviceRegistry.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.deviceId).toBe('abcd1234efgh5678');
  });

  it('updates existing device on duplicate deviceId', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);

    const updated = createDevice({ name: 'Updated Phone' });
    await deviceRegistry.addDevice(updated);

    const devices = await deviceRegistry.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.name).toBe('Updated Phone');
  });

  it('throws when adding 6th device', async () => {
    for (let i = 0; i < 5; i++) {
      await deviceRegistry.addDevice(
        createDevice({ deviceId: `device${i.toString().padStart(14, '0')}`, name: `Phone ${i}` }),
      );
    }

    await expect(
      deviceRegistry.addDevice(createDevice({ deviceId: 'device5000000000' })),
    ).rejects.toThrow('Maximum of 5 devices reached');
  });
});

describe('deviceRegistry - removeDevice', () => {
  it('removes a device', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);
    await deviceRegistry.removeDevice('abcd1234efgh5678');

    expect(await deviceRegistry.listDevices()).toHaveLength(0);
  });

  it('throws when removing non-existent device', async () => {
    await expect(deviceRegistry.removeDevice('nonexistent')).rejects.toThrow('not found');
  });

  it('switches active device when removing active device', async () => {
    const device1 = createDevice({ deviceId: 'device1000000000' });
    const device2 = createDevice({ deviceId: 'device2000000000', isPrimary: false });
    await deviceRegistry.addDevice(device1);
    await deviceRegistry.addDevice(device2);
    await deviceRegistry.setActiveDevice('device1000000000');

    await deviceRegistry.removeDevice('device1000000000');

    expect(await deviceRegistry.getActiveDeviceId()).toBe('device2000000000');
  });
});

describe('deviceRegistry - listDevices / getDevice', () => {
  it('returns empty array initially', async () => {
    expect(await deviceRegistry.listDevices()).toEqual([]);
  });

  it('getDevice returns undefined for missing device', async () => {
    expect(await deviceRegistry.getDevice('missing')).toBeUndefined();
  });

  it('getDevice returns the correct device', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);

    const found = await deviceRegistry.getDevice('abcd1234efgh5678');
    expect(found).toBeTruthy();
    expect(found!.name).toBe('Test Phone');
  });
});

describe('deviceRegistry - active device', () => {
  it('getActiveDevice returns undefined when no active device', async () => {
    expect(await deviceRegistry.getActiveDevice()).toBeUndefined();
  });

  it('setActiveDevice sets the active device', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);
    await deviceRegistry.setActiveDevice('abcd1234efgh5678');

    const active = await deviceRegistry.getActiveDevice();
    expect(active).toBeTruthy();
    expect(active!.deviceId).toBe('abcd1234efgh5678');
  });

  it('setActiveDevice throws for non-existent device', async () => {
    await expect(deviceRegistry.setActiveDevice('nonexistent')).rejects.toThrow('not found');
  });
});

describe('deviceRegistry - max 5 devices enforced', () => {
  it('allows exactly 5 devices', async () => {
    for (let i = 0; i < 5; i++) {
      await deviceRegistry.addDevice(
        createDevice({ deviceId: `device${i.toString().padStart(14, '0')}`, name: `Phone ${i}` }),
      );
    }
    expect(await deviceRegistry.listDevices()).toHaveLength(5);
    expect(await deviceRegistry.canAddDevice()).toBe(false);
  });

  it('canAddDevice returns true when under limit', async () => {
    await deviceRegistry.addDevice(createDevice());
    expect(await deviceRegistry.canAddDevice()).toBe(true);
  });
});

describe('deviceRegistry - reconcileDeviceRegistry', () => {
  it('restores from session when session has data', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);

    vi.resetModules();
    deviceRegistry = await import('./deviceRegistry');
    await deviceRegistry.reconcileDeviceRegistry();

    const devices = await deviceRegistry.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.deviceId).toBe('abcd1234efgh5678');
  });

  it('reconstructs from local metadata when session is empty', async () => {
    const meta: import('~/types').DeviceMeta = {
      deviceId: 'abcd1234efgh5678',
      name: 'Test Phone',
      lastSeen: Date.now(),
      pairedAt: Date.now(),
      isPrimary: true,
    };
    await fakeBrowser.storage.local.set({ deviceMetadata: [meta] });

    vi.resetModules();
    deviceRegistry = await import('./deviceRegistry');
    await deviceRegistry.reconcileDeviceRegistry();

    const devices = await deviceRegistry.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.deviceId).toBe('abcd1234efgh5678');
    expect(devices[0]!.phoneStaticKey).toEqual(new Uint8Array(0));
  });

  it('starts empty when no stored data exists', async () => {
    vi.resetModules();
    deviceRegistry = await import('./deviceRegistry');
    await deviceRegistry.reconcileDeviceRegistry();

    expect(await deviceRegistry.listDevices()).toHaveLength(0);
  });
});

describe('deviceRegistry - revokeDevice', () => {
  it('removes the device from registry', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);
    await deviceRegistry.revokeDevice('abcd1234efgh5678');

    expect(await deviceRegistry.listDevices()).toHaveLength(0);
  });

  it('throws when revoking non-existent device', async () => {
    await expect(deviceRegistry.revokeDevice('nonexistent')).rejects.toThrow('not found');
  });

  it('rotates the keypair in session storage', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);

    await fakeBrowser.storage.session.set({
      'pairing:device': {
        localStaticKey: [
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
          26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
          48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
        ],
        remoteStaticPublicKey: [1, 2, 3],
        handshakePattern: 'XX',
        pairedAt: Date.now(),
      },
    });

    await deviceRegistry.revokeDevice('abcd1234efgh5678');

    const stored = await fakeBrowser.storage.session.get('pairing:device');
    const cached = stored['pairing:device'] as { localStaticKey: number[] };
    expect(cached.localStaticKey).toBeDefined();
    expect(cached.localStaticKey.length).toBe(64);

    const pubKey = cached.localStaticKey.slice(0, 32);
    const secKey = cached.localStaticKey.slice(32);
    expect(pubKey.some((b) => b !== 0)).toBe(true);
    expect(secKey.some((b) => b !== 0)).toBe(true);

    const oldKey = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32,
    ];
    expect(pubKey).not.toEqual(oldKey);
  });

  it('clears the command client flag', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);
    await fakeBrowser.storage.session.set({ 'cmd:commandClient': true });

    await deviceRegistry.revokeDevice('abcd1234efgh5678');

    const stored = await fakeBrowser.storage.session.get('cmd:commandClient');
    expect(stored['cmd:commandClient']).toBeUndefined();
  });

  it('switches active device when revoking the active one', async () => {
    const device1 = createDevice({ deviceId: 'device1000000000' });
    const device2 = createDevice({ deviceId: 'device2000000000', isPrimary: false });
    await deviceRegistry.addDevice(device1);
    await deviceRegistry.addDevice(device2);
    await deviceRegistry.setActiveDevice('device1000000000');

    await deviceRegistry.revokeDevice('device1000000000');

    expect(await deviceRegistry.getActiveDeviceId()).toBe('device2000000000');
  });

  it('sets activeDeviceId to null when revoking last device', async () => {
    const device = createDevice();
    await deviceRegistry.addDevice(device);
    await deviceRegistry.setActiveDevice('abcd1234efgh5678');

    await deviceRegistry.revokeDevice('abcd1234efgh5678');

    expect(await deviceRegistry.getActiveDeviceId()).toBeNull();
  });
});

describe('deviceRegistry - resolveDeviceName', () => {
  it('generates Phone N when no phone name provided', async () => {
    const name = await deviceRegistry.resolveDeviceName();
    expect(name).toBe('Phone 1');
  });

  it('uses phone name when provided and unique', async () => {
    const name = await deviceRegistry.resolveDeviceName("Tom's Pixel");
    expect(name).toBe("Tom's Pixel");
  });

  it('deduplicates phone name with counter', async () => {
    await deviceRegistry.addDevice(createDevice({ deviceId: 'd1', name: 'Pixel' }));
    const name = await deviceRegistry.resolveDeviceName('Pixel');
    expect(name).toBe('Pixel (2)');
  });

  it('deduplicates generated Phone N names', async () => {
    await deviceRegistry.addDevice(createDevice({ deviceId: 'd1', name: 'Phone 1' }));
    const name = await deviceRegistry.resolveDeviceName();
    expect(name).toBe('Phone 2');
  });
});

describe('deviceRegistry - storage-first pattern', () => {
  it('reads from storage on first access without explicit reconcile', async () => {
    await fakeBrowser.storage.session.set({
      'pairing:devices': [
        {
          deviceId: 'stored-device',
          name: 'Stored Phone',
          phoneStaticKey: [10, 20, 30],
          lastSeen: Date.now(),
          pairedAt: Date.now(),
          isPrimary: true,
        },
      ],
      'pairing:activeDevice': 'stored-device',
    });

    vi.resetModules();
    deviceRegistry = await import('./deviceRegistry');

    const devices = await deviceRegistry.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.deviceId).toBe('stored-device');
    expect(await deviceRegistry.getActiveDeviceId()).toBe('stored-device');
  });
});
