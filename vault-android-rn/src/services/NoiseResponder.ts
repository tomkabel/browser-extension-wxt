import { NativeModules } from 'react-native';

const { NoiseResponder } = NativeModules;

if (!NoiseResponder) {
  throw new Error('NoiseResponder native module is not linked');
}

export interface SplitResult {
  encryptKey: number[];
  decryptKey: number[];
  chainingKey: number[];
}

export interface NoiseResponderHandle {
  handle: number;
}

export async function createResponderXX(localStaticKeyBytes: number[]): Promise<number> {
  return NoiseResponder.createResponderXX(localStaticKeyBytes);
}

export async function writeMessage(handle: number, payload: number[]): Promise<number[]> {
  return NoiseResponder.writeMessage(handle, payload);
}

export async function readMessage(handle: number, packet: number[]): Promise<number[]> {
  return NoiseResponder.readMessage(handle, packet);
}

export async function split(handle: number): Promise<SplitResult> {
  return NoiseResponder.split(handle);
}

export async function destroyHandle(handle: number): Promise<void> {
  return NoiseResponder.destroyHandle(handle);
}
