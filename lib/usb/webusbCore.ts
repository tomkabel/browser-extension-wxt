/// <reference types="w3c-web-usb" />
import { ANDROID_VENDOR_IDS } from '~/lib/transport/vendorIds';

export interface UsbEndpointPair {
  in: USBEndpoint;
  out: USBEndpoint;
}

export function findEndpointPair(device: USBDevice): UsbEndpointPair | null {
  let inEp: USBEndpoint | undefined;
  let outEp: USBEndpoint | undefined;

  for (const iface of device.configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      for (const ep of alt.endpoints) {
        if (ep.direction === 'in' && !inEp) inEp = ep;
        if (ep.direction === 'out' && !outEp) outEp = ep;
      }
    }
  }

  if (inEp && outEp) return { in: inEp, out: outEp };
  return null;
}

export async function openUsbDevice(device: USBDevice): Promise<void> {
  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }
  await device.claimInterface(0);
}

export async function findAndroidDevice(): Promise<USBDevice | null> {
  try {
    const devices = await navigator.usb.getDevices();
    return devices.find((d) => ANDROID_VENDOR_IDS.has(d.vendorId)) ?? null;
  } catch {
    return null;
  }
}

export async function isAndroidDeviceAvailable(): Promise<boolean> {
  try {
    const devices = await navigator.usb.getDevices();
    return devices.some((d) => ANDROID_VENDOR_IDS.has(d.vendorId));
  } catch {
    return false;
  }
}

export function bufferToUint8Array(buffer: ArrayBufferLike): Uint8Array {
  return new Uint8Array(buffer);
}

export function uint8ArrayToBufferSource(data: Uint8Array): BufferSource {
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  return ab;
}
