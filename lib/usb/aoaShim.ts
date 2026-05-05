import { browser } from 'wxt/browser';
import { log } from '~/lib/errors';
import { TRANSPORT_CONFIG } from '~/lib/transport/config';

const SHIM_HOST_NAME = 'org.smartid.aoa_shim';

export interface ShimNotInstalledError {
  kind: 'not_installed';
  message: string;
}

export interface ShimExecutionError {
  kind: 'execution_failed';
  message: string;
  vid?: number;
  pid?: number;
}

export interface ShimSuccess {
  kind: 'success';
  vid: number;
  pid: number;
}

export type ShimResult = ShimSuccess | ShimNotInstalledError | ShimExecutionError;

function isShimResponse(
  value: unknown,
): value is {
  success: boolean;
  error?: string;
  vid?: number;
  pid?: number;
  reenumerated?: boolean;
} {
  return typeof value === 'object' && value !== null && 'success' in value;
}

async function waitForAoaDevice(
  expectedVid: number,
  expectedPid: number,
  timeoutMs: number,
  pollMs: number,
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      const devices = await navigator.usb.getDevices();
      if (devices.some((d) => d.vendorId === expectedVid && d.productId === expectedPid)) {
        return true;
      }
    } catch {
      // WebUSB not available — stop polling
      return false;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}

export async function runAoaShim(): Promise<ShimResult> {
  let response: unknown;

  try {
    response = await new Promise((resolve, reject) => {
      browser.runtime.sendNativeMessage(SHIM_HOST_NAME, { type: 'negotiate' }, (resp) => {
        if (browser.runtime.lastError) {
          reject(new Error(browser.runtime.lastError.message));
          return;
        }
        resolve(resp);
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`[AoaShim] Shim not available: ${message}`);
    return { kind: 'not_installed', message };
  }

  if (!isShimResponse(response)) {
    const message = 'Invalid shim response: missing success field';
    log.warn(`[AoaShim] ${message}`);
    return { kind: 'execution_failed', message };
  }

  if (response.success) {
    const vid = response.vid ?? 0;
    const pid = response.pid ?? 0;

    if (response.reenumerated) {
      log.info(
        `[AoaShim] AOA negotiation succeeded, waiting for re-enumeration (VID: 0x${vid.toString(16)}, PID: 0x${pid.toString(16)})`,
      );
      const found = await waitForAoaDevice(
        vid,
        pid,
        TRANSPORT_CONFIG.aoaReenumerateTimeoutMs,
        TRANSPORT_CONFIG.aoaReenumeratePollMs,
      );
      if (!found) {
        return {
          kind: 'execution_failed',
          message: `AOA device did not re-enumerate within ${TRANSPORT_CONFIG.aoaReenumerateTimeoutMs}ms`,
          vid,
          pid,
        };
      }
    }

    log.info(
      `[AoaShim] AOA negotiation succeeded (VID: 0x${vid.toString(16)}, PID: 0x${pid.toString(16)})`,
    );
    return { kind: 'success', vid, pid };
  }

  const message = response.error ?? 'Unknown shim error';
  log.warn(`[AoaShim] AOA negotiation failed: ${message}`);
  return { kind: 'execution_failed', message, vid: response.vid, pid: response.pid };
}
