export const NATIVE_HOST_NAME = 'org.smartid.aoa_host';

export const TRANSPORT_CONFIG = {
  nativeHostName: NATIVE_HOST_NAME,
  pingTimeoutMs: 5000,
  connectTimeoutMs: 10000,
  sendTimeoutMs: 5000,
  hostAvailabilityCheckIntervalMs: 30000,
  usbPollIntervalMs: 2000,
  maxHealthyLatencyMs: 10000,
} as const;
