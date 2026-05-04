import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { createCommandClient, type CommandClient } from './commandClient';

function createClient(opts?: { onTransportDead?: (reason: string) => void }): {
  client: CommandClient;
  sendData: ReturnType<typeof vi.fn>;
} {
  const sendData = vi.fn().mockResolvedValue(undefined);
  const client = createCommandClient(
    sendData,
    { sign: async (data: string) => data },
    { rotate: async () => {} },
    opts,
  );
  return { client, sendData };
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CommandClient - Adaptive RTO', () => {
  it('uses adaptive RTO for retransmission', async () => {
    const { client, sendData } = createClient();

    const sendPromise = client.sendCredentialRequest('example.com', 'https://example.com', 'user', 'pass');

    await vi.advanceTimersByTimeAsync(10);

    expect(sendData).toHaveBeenCalledTimes(1);

    const rttEstimator = client.getRttEstimator();
    expect(rttEstimator.getRto()).toBeGreaterThanOrEqual(1000);

    // Simulate ACK arriving to resolve the command
    client.handleIncomingResponse(JSON.stringify({
      version: 1,
      sequence: 1,
      status: 'ok',
      data: {},
    }));

    await vi.advanceTimersByTimeAsync(100);
    await expect(sendPromise).resolves.toBeDefined();
  });

  it('command succeeds with one retry using adaptive timeout', async () => {
    const { client, sendData } = createClient();

    const sendPromise = client.sendCredentialRequest('example.com', 'https://example.com', 'user', 'pass');

    await vi.advanceTimersByTimeAsync(10);
    expect(sendData).toHaveBeenCalledTimes(1);

    // Let the timeout trigger a retry
    await vi.advanceTimersByTimeAsync(1500);
    expect(sendData).toHaveBeenCalledTimes(2);

    // Simulate ACK arriving for the retry
    client.handleIncomingResponse(JSON.stringify({
      version: 1,
      sequence: 1,
      status: 'ok',
      data: {},
    }));

    await vi.advanceTimersByTimeAsync(100);
    await expect(sendPromise).resolves.toBeDefined();
    expect(sendData).toHaveBeenCalledTimes(2);
  });
});

describe('CommandClient - Heartbeat', () => {
  it('idle transport sends ping within 16 seconds', async () => {
    const { client, sendData } = createClient();

    const sendPromise = client.sendCredentialRequest('example.com', 'https://example.com', 'user', 'pass');

    await vi.advanceTimersByTimeAsync(10);

    // Resolve the credential request
    client.handleIncomingResponse(JSON.stringify({
      version: 1,
      sequence: 1,
      status: 'ok',
      data: {},
    }));

    await vi.advanceTimersByTimeAsync(10);
    await expect(sendPromise).resolves.toBeDefined();
    sendData.mockClear();

    // Advance to past the heartbeat interval (15s + some buffer)
    await vi.advanceTimersByTimeAsync(16000);

    expect(sendData).toHaveBeenCalled();
    const sentArg = sendData.mock.calls[0]![0] as string;
    const parsed = JSON.parse(sentArg);
    expect(parsed.command).toBe('ping');
  });

  it('3 missed pings trigger transport-dead event', async () => {
    const onTransportDead = vi.fn();
    const { client, sendData } = createClient({ onTransportDead });

    // Start heartbeat by sending a command
    const sendPromise = client.sendCredentialRequest('example.com', 'https://example.com', 'user', 'pass');

    await vi.advanceTimersByTimeAsync(10);

    // Resolve the credential request so its pending entry is cleaned up
    client.handleIncomingResponse(JSON.stringify({
      version: 1,
      sequence: 1,
      status: 'ok',
      data: {},
    }));

    await vi.advanceTimersByTimeAsync(10);
    await expect(sendPromise).resolves.toBeDefined();
    sendData.mockClear();

    // Three heartbeats, each missed (no pong response), each with RTO*3 ≈ 3s timeout
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(16000);
      // Wait for the miss detect timeout (RTO floor 1000ms * 3)
      await vi.advanceTimersByTimeAsync(5000);
    }

    expect(onTransportDead).toHaveBeenCalled();
    expect(onTransportDead.mock.calls[0]![0]).toContain('heartbeat');
  });
});
