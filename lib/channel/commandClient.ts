import { browser } from 'wxt/browser';
import { CommandType } from '~/types/commands';
import type {
  CommandState,
  ControlCommand,
  ControlResponse,
  PendingCommand,
} from '~/types/commands';

const MAX_RETRIES = 3;
const ACK_TIMEOUT_MS = 5000;
const ROTATION_THRESHOLD = 1000;
const STORAGE_KEY_SEQUENCE = 'cmd:sequence';
const STORAGE_KEY_MSG_COUNT = 'cmd:msgCount';

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
  },
) {
  const pending = new Map<number, PendingCommand>();

  async function getNextSequence(): Promise<number> {
    const stored = await browser.storage.session.get(STORAGE_KEY_SEQUENCE);
    const current =
      typeof stored[STORAGE_KEY_SEQUENCE] === 'number' ? stored[STORAGE_KEY_SEQUENCE] : 0;
    const next = current + 1;
    await browser.storage.session.set({ [STORAGE_KEY_SEQUENCE]: next });
    return next;
  }

  async function getAndIncrementMessageCount(): Promise<number> {
    const stored = await browser.storage.session.get(STORAGE_KEY_MSG_COUNT);
    const current =
      typeof stored[STORAGE_KEY_MSG_COUNT] === 'number' ? stored[STORAGE_KEY_MSG_COUNT] : 0;
    const next = current + 1;
    await browser.storage.session.set({ [STORAGE_KEY_MSG_COUNT]: next });
    return next;
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

    const entry = pending.get(response.sequence);
    if (!entry) return;

    pending.delete(response.sequence);

    if (response.status === 'error') {
      entry.reject(new Error(response.error ?? 'Command failed'));
    } else {
      entry.resolve(response);
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
        sentAt: Date.now(),
        resolve,
        reject,
      };
      pending.set(command.sequence, entry);

      function attemptSend() {
        if (entry.attempts >= MAX_RETRIES) {
          pending.delete(command.sequence);
          reject(new Error(`Command ${command.sequence} failed after ${MAX_RETRIES} retries`));
          return;
        }

        entry.attempts++;
        entry.sentAt = Date.now();
        sendData(encoded).catch(() => {});

        const timeout = setTimeout(() => {
          if (pending.has(command.sequence)) {
            attemptSend();
          }
        }, ACK_TIMEOUT_MS);

        const checkResolved = () => {
          if (!pending.has(command.sequence)) {
            clearTimeout(timeout);
          }
        };
        setTimeout(checkResolved, 100);
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

    await handleKeyRotation();

    const encoded = encodeMessage(cmd);
    return sendCommandWithRetry(cmd, encoded);
  }

  async function sendAuthenticateTransaction(
    transaction: Record<string, unknown>,
  ): Promise<ControlResponse> {
    return sendCommand(CommandType.AuthenticateTransaction, transaction);
  }

  async function sendPing(): Promise<ControlResponse> {
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

  function getState(): CommandState {
    return {
      lastSequence: 0,
      messageCount: 0,
      rotationThreshold: ROTATION_THRESHOLD,
      pendingCommands: pending,
    };
  }

  return {
    sendCommand,
    sendAuthenticateTransaction,
    sendPing,
    sendCredentialRequest,
    handleIncomingResponse,
    getPendingCount,
    getState,
    signPayload,
  };
}

export type CommandClient = ReturnType<typeof createCommandClient>;
