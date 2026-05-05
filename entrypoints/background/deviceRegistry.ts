import { browser } from 'wxt/browser';
import { log } from '~/lib/errors';
import { generateKeyPair, serializeKeyPair } from '~/lib/channel/noise';
import type { DeviceRecord, DeviceMeta } from '~/types';

const SESSION_KEY = 'pairing:devices';
const LOCAL_KEY = 'deviceMetadata';
const ACTIVE_DEVICE_KEY = 'pairing:activeDevice';
const PAIRING_KEY = 'pairing:device';
const CMD_CLIENT_KEY = 'cmd:commandClient';
const MAX_DEVICES = 5;

let cachedDevices: DeviceRecord[] | null = null;
let cachedActiveId: string | null = null;
let initialized = false;

function deviceToSerializable(d: DeviceRecord) {
  return {
    deviceId: d.deviceId,
    name: d.name,
    phoneStaticKey: Array.from(d.phoneStaticKey),
    lastSeen: d.lastSeen,
    pairedAt: d.pairedAt,
    isPrimary: d.isPrimary,
  };
}

function deviceFromSerializable(s: Record<string, unknown>): DeviceRecord {
  return {
    deviceId: s.deviceId as string,
    name: s.name as string,
    phoneStaticKey: new Uint8Array(s.phoneStaticKey as number[]),
    lastSeen: s.lastSeen as number,
    pairedAt: s.pairedAt as number,
    isPrimary: s.isPrimary as boolean,
  };
}

function toMeta(d: DeviceRecord): DeviceMeta {
  return {
    deviceId: d.deviceId,
    name: d.name,
    lastSeen: d.lastSeen,
    pairedAt: d.pairedAt,
    isPrimary: d.isPrimary,
  };
}

async function loadFromStorage(): Promise<void> {
  const sessionData = await browser.storage.session.get([SESSION_KEY, ACTIVE_DEVICE_KEY]);
  const raw = sessionData[SESSION_KEY] as Record<string, unknown>[] | undefined;

  if (raw && raw.length > 0) {
    cachedDevices = raw.map(deviceFromSerializable);
    cachedActiveId = (sessionData[ACTIVE_DEVICE_KEY] as string | undefined) ?? null;
    initialized = true;
    return;
  }

  const localData = await browser.storage.local.get(LOCAL_KEY);
  const metas = localData[LOCAL_KEY] as DeviceMeta[] | undefined;

  if (metas && metas.length > 0) {
    cachedDevices = metas.map((meta) => ({
      deviceId: meta.deviceId,
      name: meta.name,
      phoneStaticKey: new Uint8Array(0),
      lastSeen: meta.lastSeen,
      pairedAt: meta.pairedAt,
      isPrimary: meta.isPrimary,
    }));
    cachedActiveId = null;
    initialized = true;
    log.info(
      '[DeviceRegistry] Reconstructed from local metadata:',
      cachedDevices.length,
      'devices (static keys missing, re-handshake required)',
    );
    return;
  }

  cachedDevices = [];
  cachedActiveId = null;
  initialized = true;
}

async function ensureLoaded(): Promise<void> {
  if (!initialized) {
    await loadFromStorage();
  }
}

async function persist(devices: DeviceRecord[], activeId: string | null): Promise<void> {
  const serializable = devices.map(deviceToSerializable);
  await browser.storage.session.set({
    [SESSION_KEY]: serializable,
    [ACTIVE_DEVICE_KEY]: activeId,
  });
  const metas = devices.map(toMeta);
  await browser.storage.local.set({ [LOCAL_KEY]: metas });
}

export async function addDevice(record: DeviceRecord): Promise<void> {
  await ensureLoaded();
  const devices = cachedDevices!;

  if (devices.length >= MAX_DEVICES && !devices.some((d) => d.deviceId === record.deviceId)) {
    throw new Error(`Maximum of ${MAX_DEVICES} devices reached. Remove a device first.`);
  }

  const existing = devices.findIndex((d) => d.deviceId === record.deviceId);
  if (existing !== -1) {
    devices[existing] = record;
  } else {
    devices.push(record);
  }

  await persist(devices, cachedActiveId);
  cachedDevices = devices;
  log.info('[DeviceRegistry] Added device:', record.deviceId);
}

export async function removeDevice(deviceId: string): Promise<void> {
  await ensureLoaded();
  const devices = cachedDevices!;
  const index = devices.findIndex((d) => d.deviceId === deviceId);
  if (index === -1) {
    throw new Error(`Device ${deviceId} not found`);
  }

  devices.splice(index, 1);

  if (cachedActiveId === deviceId) {
    cachedActiveId = devices.length > 0 ? devices[0]!.deviceId : null;
  }

  await persist(devices, cachedActiveId);
  cachedDevices = devices;
  log.info('[DeviceRegistry] Removed device:', deviceId);
}

export async function getDevice(deviceId: string): Promise<DeviceRecord | undefined> {
  await ensureLoaded();
  return cachedDevices!.find((d) => d.deviceId === deviceId);
}

export async function listDevices(): Promise<DeviceRecord[]> {
  await ensureLoaded();
  return [...cachedDevices!];
}

export async function setActiveDevice(deviceId: string): Promise<void> {
  await ensureLoaded();
  const devices = cachedDevices!;
  const device = devices.find((d) => d.deviceId === deviceId);
  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }

  device.lastSeen = Date.now();
  cachedActiveId = deviceId;
  await persist(devices, cachedActiveId);
  log.info('[DeviceRegistry] Active device set:', deviceId);
}

export async function getActiveDevice(): Promise<DeviceRecord | undefined> {
  await ensureLoaded();
  if (!cachedActiveId) return undefined;
  return cachedDevices!.find((d) => d.deviceId === cachedActiveId);
}

export async function getActiveDeviceId(): Promise<string | null> {
  await ensureLoaded();
  return cachedActiveId;
}

export async function updateDeviceLastSeen(deviceId: string): Promise<void> {
  await ensureLoaded();
  const devices = cachedDevices!;
  const device = devices.find((d) => d.deviceId === deviceId);
  if (!device) return;
  device.lastSeen = Date.now();
  await persist(devices, cachedActiveId);
}

export async function reconcileDeviceRegistry(): Promise<void> {
  initialized = false;
  cachedDevices = null;
  cachedActiveId = null;
  await loadFromStorage();
}

export async function getDeviceCount(): Promise<number> {
  await ensureLoaded();
  return cachedDevices!.length;
}

export async function canAddDevice(): Promise<boolean> {
  await ensureLoaded();
  return cachedDevices!.length < MAX_DEVICES;
}

export async function revokeDevice(deviceId: string): Promise<void> {
  await ensureLoaded();
  const devices = cachedDevices!;
  const device = devices.find((d) => d.deviceId === deviceId);
  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }

  const newKeyPair = generateKeyPair();
  const serialized = serializeKeyPair(newKeyPair);

  await browser.storage.session.set({
    [PAIRING_KEY]: {
      localStaticKey: serialized,
      remoteStaticPublicKey: [],
      handshakePattern: 'XX',
      pairedAt: Date.now(),
    },
  });

  const index = devices.findIndex((d) => d.deviceId === deviceId);
  if (index !== -1) {
    devices.splice(index, 1);
  }

  if (cachedActiveId === deviceId) {
    cachedActiveId = devices.length > 0 ? devices[0]!.deviceId : null;
  }

  await persist(devices, cachedActiveId);
  await browser.storage.session.remove(CMD_CLIENT_KEY);

  broadcastRevocation(deviceId).catch(async (err) => {
    log.warn('[DeviceRegistry] Revocation broadcast failed, caching for retry:', err);
    await cacheRevocationForLater(deviceId).catch(() => {});
  });

  log.info('[DeviceRegistry] Revoked device:', deviceId, '- keypair rotated');
}

function getSignalingUrl(): string | null {
  try {
    return import.meta.env.VITE_SIGNALING_URL ?? null;
  } catch {
    return null;
  }
}

async function broadcastRevocation(deviceId: string): Promise<void> {
  const signalingUrl = getSignalingUrl();
  if (signalingUrl) {
    try {
      const response = await fetch(`${signalingUrl}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      if (response.ok) {
        log.info('[DeviceRegistry] Revocation posted to signaling server:', deviceId);
        return;
      }
      log.warn('[DeviceRegistry] Signaling server rejected revocation:', response.status);
    } catch (err) {
      log.warn('[DeviceRegistry] Signaling server unreachable:', err);
    }
  }

  try {
    await browser.runtime.sendMessage({
      type: 'webrtc-send',
      payload: {
        data: Array.from(
          new TextEncoder().encode(JSON.stringify({ type: 'revoke', deviceId, ts: Date.now() })),
        ),
      },
    });
    log.info('[DeviceRegistry] Revocation sent via data channel:', deviceId);
  } catch {
    throw new Error('No transport available for revocation broadcast');
  }
}

async function cacheRevocationForLater(deviceId: string): Promise<void> {
  const key = 'pending:revocations';
  const stored = await browser.storage.local.get(key);
  const pending = (stored[key] as string[] | undefined) ?? [];
  if (!pending.includes(deviceId)) {
    pending.push(deviceId);
    await browser.storage.local.set({ [key]: pending });
  }
}

export async function flushPendingRevocations(): Promise<string[]> {
  const key = 'pending:revocations';
  const stored = await browser.storage.local.get(key);
  const pending = (stored[key] as string[] | undefined) ?? [];
  if (pending.length === 0) return [];

  const succeeded: string[] = [];
  for (const deviceId of pending) {
    try {
      await broadcastRevocation(deviceId);
      succeeded.push(deviceId);
    } catch {
      break;
    }
  }

  if (succeeded.length > 0) {
    const remaining = pending.filter((id) => !succeeded.includes(id));
    await browser.storage.local.set({ [key]: remaining });
  }

  return succeeded;
}

export async function resolveDeviceName(phoneName?: string): Promise<string> {
  await ensureLoaded();
  const devices = cachedDevices!;
  const names = new Set(devices.map((d) => d.name));

  if (phoneName && phoneName.trim()) {
    const trimmed = phoneName.trim();
    if (!names.has(trimmed)) return trimmed;
    let counter = 2;
    while (names.has(`${trimmed} (${counter})`)) counter++;
    return `${trimmed} (${counter})`;
  }

  let counter = devices.length + 1;
  while (names.has(`Phone ${counter}`)) counter++;
  return `Phone ${counter}`;
}

export const MAX_DEVICE_LIMIT = MAX_DEVICES;
