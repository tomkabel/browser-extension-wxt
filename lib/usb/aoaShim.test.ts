import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendNativeMessage = vi.fn();
let mockLastErrorValue: { message: string } | undefined;

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendNativeMessage: (...args: unknown[]) => mockSendNativeMessage(...args),
      get lastError() {
        return mockLastErrorValue;
      },
    },
  },
}));

import { runAoaShim } from './aoaShim';

describe('runAoaShim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLastErrorValue = undefined;
  });

  it('returns success when shim reports success with vid/pid', async () => {
    mockSendNativeMessage.mockImplementation(
      (_name: string, _msg: unknown, cb: (resp: unknown) => void) => {
        cb({ success: true, vid: 0x18d1, pid: 0x2d01 });
      },
    );

    const result = await runAoaShim();
    expect(result).toEqual({ kind: 'success', vid: 0x18d1, pid: 0x2d01 });
  });

  it('returns execution_failed when shim reports success: false', async () => {
    mockSendNativeMessage.mockImplementation(
      (_name: string, _msg: unknown, cb: (resp: unknown) => void) => {
        cb({ success: false, error: 'no USB device found' });
      },
    );

    const result = await runAoaShim();
    expect(result).toEqual({
      kind: 'execution_failed',
      message: 'no USB device found',
      vid: undefined,
      pid: undefined,
    });
  });

  it('returns not_installed when native messaging fails', async () => {
    mockSendNativeMessage.mockImplementation(
      (_name: string, _msg: unknown, cb: (resp: unknown) => void) => {
        mockLastErrorValue = { message: 'Specified native messaging host not found.' };
        cb(undefined);
        mockLastErrorValue = undefined;
      },
    );

    const result = await runAoaShim();
    expect(result.kind).toBe('not_installed');
    if (result.kind === 'not_installed') {
      expect(result.message).toContain('native messaging host not found');
    }
  });

  it('returns execution_failed when response lacks success field', async () => {
    mockSendNativeMessage.mockImplementation(
      (_name: string, _msg: unknown, cb: (resp: unknown) => void) => {
        cb({ foo: 'bar' });
      },
    );

    const result = await runAoaShim();
    expect(result).toEqual({
      kind: 'execution_failed',
      message: 'Invalid shim response: missing success field',
    });
  });

  it('sends correct host name and message type', async () => {
    mockSendNativeMessage.mockImplementation(
      (_name: string, _msg: unknown, cb: (resp: unknown) => void) => {
        cb({ success: true, vid: 0, pid: 0 });
      },
    );

    await runAoaShim();

    expect(mockSendNativeMessage).toHaveBeenCalledWith(
      'org.smartid.aoa_shim',
      { type: 'negotiate' },
      expect.any(Function),
    );
  });
});
