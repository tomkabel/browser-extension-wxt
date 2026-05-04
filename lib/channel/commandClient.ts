import { browser } from 'wxt/browser';
import { RttEstimator } from './rttEstimator';
import { CommandType } from '~/types/commands';
import type {
  CommandState,
  ControlCommand,
  ControlResponse,
  PendingCommand,
} from '~/types/commands';

const MAX_RETRIES = 3;
const ROTATION_THRESHOLD = 1000;
const STORAGE_KEY_SEQUENCE = 'cmd:sequence';
const STORAGE_KEY_MSG_COUNT = 'cmd:msgCount';
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_MISSED_PINGS = 3;

interface SignatureProvider {
  sign(data: string): Promise<string>;
}

interface KeyRotationProvider {
  rotate(messageCount: number): Promise<void>;
}

type CommandSender = (encoded: string) => Promise<void>;

export function createCommandClient(
  sendData: CommandSender,
  signatureProvider: SignatureProvider,
  keyRotationProvider: KeyRotationProvider,
  options?: {
    sessionGuard?: () => Promise<void>;
    onTransportDead?: (reason: string) => void;
  },
) {
  const pending = new Map<number, PendingCommand>();
  const pendingTimeouts = new Map<number, AbortController>();
  const rttEstimator = new RttEstimator();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let missedPings = 0;
  let lastCommandTime = 0;
  let pendingPingSeq: number | null = null;

  async function getNextSequence(): Promise<number> {
    const stored = await browser.storage.session.get(STORAGE_KEY_SEQUENCE);
    const current =
      typeof stored[STORAGE_KEY_SEQUENCE] === 'number' ? stored[STORAGE_KEY_SEQUENCE] : 0;
    const next = current + 1;
    await browser.storage.session.set({ [STORAGE_KEY_SEQUENCE]: next });
    return next;
  }

  let messageCountLock: Promise<void> = Promise.resolve();

  async function getAndIncrementMessageCount(): Promise<number> {
    let result!: number;
    messageCountLock = messageCountLock.then(async () => {
      const stored = await browser.storage.session.get(STORAGE_KEY_MSG_COUNT);
      const current =
        typeof stored[STORAGE_KEY_MSG_COUNT] === 'number' ? stored[STORAGE_KEY_MSG_COUNT] : 0;
      result = current + 1;
      await browser.storage.session.set({ [STORAGE_KEY_MSG_COUNT]: result });
    });
    await messageCountLock;
    return result;
  }

  async function handleKeyRotation(): Promise<void> {
    const count = await getAndIncrementMessageCount();
    if (count > 0 && count % ROTATION_THRESHOLD === 0) {
      await keyRotationProvider.rotate(count);
    }
  }

  async function signPayload(payload: Record<string, unknown>): Promise<string | undefined> {
    const data = JSON.stringify(payload);
    try {
      return await signatureProvider.sign(data);
    } catch {
      return undefined;
    }
  }

  function createCommand(
    command: CommandType,
    payload: Record<string, unknown>,
    sequence: number,
  ): ControlCommand {
    return {
      version: 1,
      sequence,
      command,
      payload,
      timestamp: Date.now(),
    };
  }

  function encodeMessage(command: ControlCommand): string {
    return JSON.stringify(command);
  }

  function decodeMessage(raw: string): ControlResponse | null {
    try {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.version === 'number' &&
        typeof parsed.sequence === 'number' &&
        typeof parsed.status === 'string'
      ) {
        return parsed as ControlResponse;
      }
      return null;
    } catch {
      return null;
    }
  }

  function handleIncomingResponse(raw: string): void {
    const response = decodeMessage(raw);
    if (!response) return;

    if (response.status === 'pong') {
      if (pendingPingSeq === response.sequence) {
        pendingPingSeq = null;
        missedPings = 0;
        const ac = pendingTimeouts.get(response.sequence);
        if (ac) {
          ac.abort();
          pendingTimeouts.delete(response.sequence);
        }
      }
    }

    const entry = pending.get(response.sequence);
    if (!entry) return;

    const rttSample = performance.now() - entry.sentAt;
    if (rttSample > 0 && rttSample < 30000) {
      rttEstimator.updateRtt(rttSample);
    }

    const controller = pendingTimeouts.get(response.sequence);
    if (controller) {
      controller.abort();
      pendingTimeouts.delete(response.sequence);
    }

    pending.delete(response.sequence);

    if (response.status === 'error') {
      entry.reject(new Error(response.error ?? 'Command failed'));
    } else {
      entry.resolve(response);
    }
  }

  async function sendHeartbeatPing(): Promise<void> {
    if (Date.now() - lastCommandTime < HEARTBEAT_INTERVAL_MS) return;

    const sequence = await getNextSequence();
    pendingPingSeq = sequence;
    const cmd = createCommand(CommandType.Ping, { ts: performance.now() }, sequence);
    const encoded = encodeMessage(cmd);
    try {
      await sendData(encoded);
    } catch {
      // transport send failed, will be detected by missed pings
    }

    const ac = new AbortController();
    const signal = ac.signal;
    pendingTimeouts.set(sequence, ac);

    setTimeout(() => {
      if (signal.aborted) return;
      if (pendingPingSeq === sequence) {
        pendingPingSeq = null;
        pendingTimeouts.delete(sequence);
        missedPings++;
        if (missedPings >= MAX_MISSED_PINGS) {
          stopHeartbeat();
          options?.onTransportDead?.('WebRTC heartbeat failure: 3 consecutive pings missed');
        }
      }
    }, rttEstimator.getRto() * MAX_RETRIES);
  }

  function startHeartbeat(): void {
    stopHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeatPing, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function sendCommandWithRetry(
    command: ControlCommand,
    encoded: string,
  ): Promise<ControlResponse> {
    return new Promise<ControlResponse>((resolve, reject) => {
      const entry: PendingCommand = {
        command,
        attempts: 0,
        sentAt: performance.now(),
        resolve,
        reject,
      };
      pending.set(command.sequence, entry);

      const ac = new AbortController();
      pendingTimeouts.set(command.sequence, ac);
      const signal = ac.signal;

      function attemptSend() {
        if (signal.aborted) return;
        if (entry.attempts >= MAX_RETRIES) {
          pendingTimeouts.delete(command.sequence);
          pending.delete(command.sequence);
          reject(new Error(`Command ${command.sequence} failed after ${MAX_RETRIES} retries`));
          return;
        }

        entry.attempts++;
        entry.sentAt = performance.now();
        sendData(encoded).catch(() => {});

        const rto = rttEstimator.getRto();
        const timer = setTimeout(() => {
          if (signal.aborted) return;
          if (pending.has(command.sequence)) {
            attemptSend();
          }
        }, rto);

        signal.addEventListener('abort', () => {
          clearTimeout(timer);
        }, { once: true });
      }

      attemptSend();
    });
  }

  async function sendCommand(
    command: CommandType,
    payload: Record<string, unknown>,
  ): Promise<ControlResponse> {
    if (options?.sessionGuard) {
      await options.sessionGuard();
    }

    const sequence = await getNextSequence();
    const cmd = createCommand(command, payload, sequence);
    const signature = await signPayload(payload);
    if (signature) {
      cmd.signature = signature;
    }

    await handleKeyRotation();

    const encoded = encodeMessage(cmd);
    lastCommandTime = Date.now();
    if (command !== CommandType.Ping) {
      startHeartbeat();
    }
    return sendCommandWithRetry(cmd, encoded);
  }

  async function sendAuthenticateTransaction(
    transaction: Record<string, unknown>,
  ): Promise<ControlResponse> {
    return sendCommand(CommandType.AuthenticateTransaction, transaction);
  }

  async function sendPing(): Promise<ControlResponse> {
    for (const entry of pending.values()) {
      if (entry.command.command === CommandType.Ping) {
        return Promise.reject(new Error('A ping command is already in-flight'));
      }
    }
    return sendCommand(CommandType.Ping, {});
  }

  async function sendCredentialRequest(
    domain: string,
    url: string,
    usernameFieldId: string,
    passwordFieldId: string,
  ): Promise<ControlResponse> {
    return sendCommand(CommandType.CredentialRequest, {
      domain,
      url,
      usernameFieldId,
      passwordFieldId,
    });
  }

  function getPendingCount(): number {
    return pending.size;
  }

  async function getState(): Promise<CommandState> {
    const [seqStored, countStored] = await Promise.all([
      browser.storage.session.get(STORAGE_KEY_SEQUENCE),
      browser.storage.session.get(STORAGE_KEY_MSG_COUNT),
    ]);
    return {
      lastSequence:
        typeof seqStored[STORAGE_KEY_SEQUENCE] === 'number'
          ? seqStored[STORAGE_KEY_SEQUENCE]
          : 0,
      messageCount:
        typeof countStored[STORAGE_KEY_MSG_COUNT] === 'number'
          ? countStored[STORAGE_KEY_MSG_COUNT]
          : 0,
      rotationThreshold: ROTATION_THRESHOLD,
      pendingCommands: pending,
    };
  }

  function getRttEstimator(): RttEstimator {
    return rttEstimator;
  }

  return {
    sendCommand,
    sendAuthenticateTransaction,
    sendPing,
    sendCredentialRequest,
    handleIncomingResponse,
    getPendingCount,
    getState,
    getRttEstimator,
    startHeartbeat,
    stopHeartbeat,
  };
}

export type CommandClient = ReturnType<typeof createCommandClient>;
