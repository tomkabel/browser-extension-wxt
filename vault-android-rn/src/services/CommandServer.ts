import type {
  ControlCommand,
  ControlResponse,
  CommandType,
  CredentialRequestPayload,
  AuthenticateTransactionPayload,
  PingPayload,
  Coordinate,
} from '../types';
import { NoiseTransport } from './NoiseTransport';
import { useAppStore } from '../store';

const __DEV__ = process.env.NODE_ENV !== 'production';

export type CommandHandler = (command: ControlCommand) => Promise<ControlResponse>;

const HEARTBEAT_TIMEOUT_MS = 30_000;
const MAX_MISSED_PINGS = 3;

export interface CommandServerDeps {
  lookupCredential: (domain: string) => Promise<{ username: string; password: string } | null>;
  promptBiometric: () => Promise<boolean>;
  getSmartIdPin: () => Promise<string | null>;
  mapPinToCoordinates: (pin: string) => Coordinate[] | null;
  holdSequence: (coords: Coordinate[]) => Promise<void>;
  executeSequence: () => Promise<void>;
  clearSequence: () => Promise<void>;
  awaitForegroundAndExecute: (timeoutMs: number) => Promise<void>;
}

export class CommandServer {
  private transport: NoiseTransport;
  private deps: CommandServerDeps;
  private handlers: Map<CommandType, CommandHandler> = new Map();
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageTime = 0;
  private missedPings = 0;
  private onReconnect: (() => void) | null = null;

  constructor(transport: NoiseTransport, deps: CommandServerDeps) {
    this.transport = transport;
    this.deps = deps;

    this.registerHandlers();
    this.transport.setMessageHandler((data) => this.handleRawMessage(data));
  }

  private registerHandlers(): void {
    this.handlers.set('credential-request', this.handleCredentialRequest.bind(this));
    this.handlers.set('authenticate_transaction', this.handleAuthenticateTransaction.bind(this));
    this.handlers.set('ping', this.handlePing.bind(this));
  }

  private async handleRawMessage(data: Uint8Array): Promise<void> {
    this.lastMessageTime = Date.now();
    this.missedPings = 0;

    let command: ControlCommand;
    try {
      const text = new TextDecoder().decode(data);
      command = JSON.parse(text) as ControlCommand;
    } catch {
      // Invalid JSON — silent drop (security: no error response)
      return;
    }

    if (!command.command || typeof command.sequence !== 'number') {
      // Invalid structure — silent drop
      return;
    }

    const handler = this.handlers.get(command.command);
    if (!handler) {
      // Unknown command — respond with error
      const response: ControlResponse = {
        status: 'error',
        sequence: command.sequence,
        error: 'unknown_command',
      };
      this.sendResponse(response);
      return;
    }

    try {
      const response = await handler(command);
      this.sendResponse(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'internal_error';
      console.error(`[CommandServer] Handler error for ${command.command}:`, err);
      this.sendResponse({
        status: 'error',
        sequence: command.sequence,
        error: __DEV__ ? errorMessage : 'internal_error',
      });
    }
  }

  private async handleCredentialRequest(command: ControlCommand): Promise<ControlResponse> {
    const payload = command.payload as CredentialRequestPayload;
    if (!payload.domain) {
      return { status: 'error', sequence: command.sequence, error: 'missing_domain' };
    }

    const hasCreds = useAppStore.getState().hasLhvCredentials;
    if (!hasCreds) {
      return { status: 'not_found', sequence: command.sequence };
    }

    // Prompt biometric
    const biometricOk = await this.deps.promptBiometric();
    if (!biometricOk) {
      return { status: 'error', sequence: command.sequence, error: 'biometry_failed' };
    }

    const creds = await this.deps.lookupCredential(payload.domain);
    if (!creds) {
      return { status: 'not_found', sequence: command.sequence };
    }

    return {
      status: 'found',
      sequence: command.sequence,
      username: creds.username,
      password: creds.password,
      approval_mode: 'auto',
    };
  }

  private async handleAuthenticateTransaction(command: ControlCommand): Promise<ControlResponse> {
    const payload = command.payload as AuthenticateTransactionPayload;

    const pin = await this.deps.getSmartIdPin();
    if (!pin) {
      return { status: 'error', sequence: command.sequence, error: 'pin_not_found' };
    }

    const coords = this.deps.mapPinToCoordinates(pin);
    if (!coords) {
      return { status: 'error', sequence: command.sequence, error: 'device_not_calibrated' };
    }

    try {
      await this.deps.holdSequence(coords);
      useAppStore.getState().setIsSequenceHeld(true);
      useAppStore.getState().setHeldCoordinates(coords);

      // Notify extension that we're waiting for biometric
      const pendingResponse: ControlResponse = {
        status: 'pending',
        sequence: command.sequence,
        approval_mode: 'biometric',
      };
      this.sendResponse(pendingResponse);

      // Prompt biometric
      const biometricOk = await this.deps.promptBiometric();
      if (!biometricOk) {
        await this.deps.clearSequence();
        useAppStore.getState().setIsSequenceHeld(false);
        useAppStore.getState().setHeldCoordinates(null);
        return { status: 'error', sequence: command.sequence, error: 'biometry_failed' };
      }

      // Wait for Smart-ID app foreground, then execute (D7: awaitForegroundAndExecute
      // fires the taps internally once ee.sk.smartid is detected)
      await this.deps.awaitForegroundAndExecute(30_000);

      useAppStore.getState().setIsSequenceHeld(false);
      useAppStore.getState().setHeldCoordinates(null);

      return { status: 'confirmed', sequence: command.sequence };
    } catch (err) {
      await this.deps.clearSequence();
      useAppStore.getState().setIsSequenceHeld(false);
      useAppStore.getState().setHeldCoordinates(null);
      const errorMessage = err instanceof Error ? err.message : 'unknown_error';
      return { status: 'error', sequence: command.sequence, error: errorMessage };
    }
  }

  private async handlePing(command: ControlCommand): Promise<ControlResponse> {
    return {
      status: 'pong',
      sequence: command.sequence,
    };
  }

  private sendResponse(response: ControlResponse): void {
    const encoded = new TextEncoder().encode(JSON.stringify(response));
    this.transport.sendEncrypted(encoded);
  }

  startHeartbeat(onReconnect: () => void): void {
    this.onReconnect = onReconnect;
    this.lastMessageTime = Date.now();
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastMessageTime;
      if (elapsed >= HEARTBEAT_TIMEOUT_MS) {
        this.missedPings++;
        if (this.missedPings >= MAX_MISSED_PINGS) {
          this.onReconnect?.();
        }
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.missedPings = 0;
    this.onReconnect = null;
  }

  destroy(): void {
    this.stopHeartbeat();
    this.transport.close();
  }
}
