export type CommandType =
  | 'credential-request'
  | 'authenticate_transaction'
  | 'ping';

export interface ControlCommand {
  command: CommandType;
  sequence: number;
  payload: CredentialRequestPayload | AuthenticateTransactionPayload | PingPayload;
}

export interface CredentialRequestPayload {
  domain: string;
  url: string;
  usernameFieldId: string;
  passwordFieldId: string;
}

export interface AuthenticateTransactionPayload {
  amount: string;
  recipient: string;
  timestamp: number;
}

export interface PingPayload {
  ts: number;
}

export type ControlResponseStatus =
  | 'found'
  | 'not_found'
  | 'pending'
  | 'confirmed'
  | 'pong'
  | 'error';

export interface ControlResponse {
  status: ControlResponseStatus;
  sequence: number;
  username?: string;
  password?: string;
  approval_mode?: 'auto' | 'biometric';
  error?: string;
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface NoiseSession {
  handle: number;
  encryptKey: Uint8Array;
  decryptKey: Uint8Array;
  chainingKey: Uint8Array;
  isComplete: boolean;
}

export interface ProtocolCapabilities {
  version: number;
  supportedCommands: CommandType[];
  maxMessageSize: number;
}

export interface PairingParams {
  sasCode: string;
  nonce: string;
  commitment: string;
}

export interface SignalingConfig {
  serverUrl: string;
  sasCode: string;
}

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type PairingStatus =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'handshaking'
  | 'awaiting_sas_confirmation'
  | 'paired'
  | 'error';

export interface VaultCredential {
  domain: string;
  username: string;
  password: string;
}

export interface StoredPin {
  domain: string;
  encryptedPin: string;
}

export const EMOJI_PALETTE: [string, string][] = [
  ['\u{1F680}', 'Rocket'],
  ['\u{1F3B8}', 'Guitar'],
  ['\u{1F951}', 'Avocado'],
  ['\u{1F40B}', 'Whale'],
  ['\u{1F308}', 'Rainbow'],
  ['\u{1F334}', 'Palm Tree'],
  ['\u{1F427}', 'Penguin'],
  ['\u{1F30D}', 'Globe'],
  ['\u{1F438}', 'Frog'],
  ['\u{1F98A}', 'Fox'],
  ['\u{1F31F}', 'Star'],
  ['\u{1F349}', 'Watermelon'],
  ['\u{1F4A1}', 'Light Bulb'],
  ['\u{1F525}', 'Fire'],
  ['\u{1F98B}', 'Butterfly'],
  ['\u{1F422}', 'Turtle'],
  ['\u{1F33B}', 'Sunflower'],
  ['\u{1F36B}', 'Chocolate'],
  ['\u{1F4A3}', 'Bomb'],
  ['\u{1F40C}', 'Snail'],
  ['\u{1F318}', 'Moon'],
  ['\u{1F3AF}', 'Target'],
  ['\u{1F48E}', 'Gem'],
  ['\u{1F381}', 'Gift'],
  ['\u{1F6C0}', 'Bath'],
  ['\u{1F98D}', 'Gorilla'],
  ['\u{1F418}', 'Elephant'],
  ['\u{1F98C}', 'Deer'],
  ['\u{1F40A}', 'Crocodile'],
  ['\u{1F32D}', 'Hot Dog'],
  ['\u{1F3C0}', 'Basketball'],
  ['\u{1F3C8}', 'Football'],
  ['\u{1F3BE}', 'Tennis'],
  ['\u{1F47B}', 'Ghost'],
  ['\u{1F4A9}', 'Pile of Poo'],
  ['\u{1F916}', 'Robot'],
  ['\u{1F954}', 'Potato'],
  ['\u{1F34E}', 'Apple'],
  ['\u{1F34C}', 'Banana'],
  ['\u{1F353}', 'Strawberry'],
  ['\u{1F355}', 'Pizza'],
  ['\u{1F354}', 'Hamburger'],
  ['\u{1F436}', 'Dog'],
  ['\u{1F431}', 'Cat'],
  ['\u{1F430}', 'Rabbit'],
  ['\u{1F434}', 'Horse'],
  ['\u{1F984}', 'Unicorn'],
  ['\u{1F988}', 'Shark'],
  ['\u{1F42C}', 'Dolphin'],
  ['\u{1F41D}', 'Bee'],
  ['\u{1F41B}', 'Bug'],
  ['\u{1F4A6}', 'Droplets'],
  ['\u{1F32A}', 'Tornado'],
  ['\u{1F30A}', 'Wave'],
  ['\u26A1', 'Lightning'],
  ['\u2600', 'Sun'],
  ['\u2744', 'Snowflake'],
  ['\u{1F33A}', 'Hibiscus'],
  ['\u{1F33C}', 'Blossom'],
  ['\u{1F33E}', 'Sheaf of Rice'],
  ['\u{1F6B2}', 'Bicycle'],
  ['\u2708', 'Airplane'],
  ['\u{1F6A2}', 'Ship'],
  ['\u{1F453}', 'Eyeglasses'],
];

export function emojiAtIndex(index: number): string {
  const entry = EMOJI_PALETTE[index];
  if (!entry) {
    throw new RangeError(`Emoji index ${index} out of range (0-${EMOJI_PALETTE.length - 1})`);
  }
  return entry[0]!;
}
