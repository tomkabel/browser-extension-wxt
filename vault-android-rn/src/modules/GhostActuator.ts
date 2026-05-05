import { NativeModules, NativeEventEmitter } from 'react-native';
import type { Coordinate } from '../types';

const { GhostActuatorBridge } = NativeModules;

if (!GhostActuatorBridge) {
  throw new Error('GhostActuatorBridge native module is not linked');
}

const eventEmitter = new NativeEventEmitter(GhostActuatorBridge);

export interface GhostActuatorResult {
  success: boolean;
  error?: string;
  packageName?: string;
}

export async function holdSequence(coordinates: Coordinate[]): Promise<void> {
  // Native module expects plain {x, y} objects — pass coordinates directly
  // without transformation since Coordinate already matches the native format
  return GhostActuatorBridge.holdSequence(coordinates);
}

export async function executeSequence(): Promise<void> {
  return GhostActuatorBridge.executeSequence();
}

export async function clearSequence(): Promise<void> {
  return GhostActuatorBridge.clearSequence();
}

export async function awaitForegroundAndExecute(timeoutMs: number = 30_000): Promise<void> {
  return GhostActuatorBridge.awaitForegroundAndExecute(timeoutMs);
}

export function onGhostActuatorCompleted(callback: () => void): () => void {
  const subscription = eventEmitter.addListener('GhostActuatorCompleted', callback);
  return () => subscription.remove();
}

export function onGhostActuatorFailed(callback: (error: GhostActuatorResult) => void): () => void {
  const subscription = eventEmitter.addListener('GhostActuatorFailed', callback);
  return () => subscription.remove();
}
