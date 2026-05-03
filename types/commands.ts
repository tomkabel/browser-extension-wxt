export enum CommandType {
  AuthenticateTransaction = 'authenticate_transaction',
  ConfirmTransaction = 'confirm_transaction',
  RejectTransaction = 'reject_transaction',
  ReadScreen = 'read_screen',
  Ping = 'ping',
  CredentialRequest = 'credential-request',
}

export interface ControlCommand {
  version: 1;
  sequence: number;
  command: CommandType;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface ControlResponse {
  version: 1;
  sequence: number;
  status: 'ok' | 'error' | 'confirmed' | 'rejected';
  data?: Record<string, unknown>;
  error?: string;
  signature?: string;
}

export interface CommandState {
  lastSequence: number;
  messageCount: number;
  rotationThreshold: number;
  pendingCommands: Map<number, PendingCommand>;
}

export interface PendingCommand {
  command: ControlCommand;
  attempts: number;
  sentAt: number;
  resolve: (response: ControlResponse) => void;
  reject: (error: Error) => void;
}

export interface TransactionContext {
  amount: string;
  recipient: string;
  iban?: string;
  hash: string;
  pageUrl: string;
  detectedAt: number;
}
