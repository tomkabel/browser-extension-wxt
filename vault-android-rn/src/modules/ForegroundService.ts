import { NativeModules } from 'react-native';

const { ForegroundService } = NativeModules;

if (!ForegroundService) {
  throw new Error('ForegroundService native module is not linked');
}

export async function startForegroundService(): Promise<void> {
  return ForegroundService.start();
}

export async function stopForegroundService(): Promise<void> {
  return ForegroundService.stop();
}
