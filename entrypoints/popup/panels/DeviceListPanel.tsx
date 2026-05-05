import { useEffect, useState, useCallback, forwardRef } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '~/lib/store';
import type { DeviceMeta } from '~/types';

interface Device extends DeviceMeta {
  isActive: boolean;
}

export const DeviceListPanel = forwardRef<HTMLHeadingElement>(
  function DeviceListPanel(_props, ref) {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [switching, setSwitching] = useState<string | null>(null);
    const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
    const connectionState = useAppStore((s) => s.connectionState);
    const setShowDevices = useAppStore((s) => s.setShowDevices);

    const loadDevices = useCallback(async () => {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'get-devices',
          payload: null,
        });
        if (response?.success) {
          setDevices(response.data.devices);
        } else {
          setError(response?.error ?? 'Failed to load devices');
        }
      } catch {
        setError('Failed to connect to background worker');
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      loadDevices();
    }, [loadDevices]);

    const handleSwitch = useCallback(
      async (deviceId: string) => {
        if (switching) return;
        setSwitching(deviceId);
        setError(null);

        try {
          const response = await browser.runtime.sendMessage({
            type: 'switch-device',
            payload: { deviceId },
          });
          if (response?.success) {
            setDevices((prev) =>
              prev.map((d) => ({
                ...d,
                isActive: d.deviceId === deviceId,
              })),
            );
          } else {
            setError(response?.error ?? 'Failed to switch device');
          }
        } catch {
          setError('Failed to connect to background worker');
        } finally {
          setSwitching(null);
        }
      },
      [switching],
    );

    const handleRevoke = useCallback(async (deviceId: string) => {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'revoke-device',
          payload: { deviceId },
        });
        if (response?.success) {
          setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
          setConfirmRevoke(null);
        } else {
          setError(response?.error ?? 'Failed to revoke device');
        }
      } catch {
        setError('Failed to connect to background worker');
      }
    }, []);

    if (loading) {
      return (
        <div className="p-4 text-center">
          <p className="text-sm text-gray-400">Loading devices...</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 ref={ref} tabIndex={-1} className="text-sm font-bold text-gray-800">
            Paired Devices
          </h2>
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => setShowDevices(false)}
          >
            Back
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-500 text-center py-2" role="alert">
            {error}
          </p>
        )}

        {devices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No paired devices</p>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => {
              const isCurrentActive = device.isActive;
              const isConnected = isCurrentActive && connectionState === 'connected';
              const isConnecting =
                isCurrentActive &&
                (connectionState === 'connecting' || connectionState === 'reconnecting');

              return (
                <div
                  key={device.deviceId}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isCurrentActive
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="radio"
                    name="active-device"
                    checked={isCurrentActive}
                    onChange={() => handleSwitch(device.deviceId)}
                    disabled={switching !== null}
                    className="shrink-0"
                    aria-label={`Switch to ${device.name}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 truncate">{device.name}</p>
                      {isCurrentActive && (
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            isConnected
                              ? 'bg-green-500'
                              : isConnecting
                                ? 'bg-yellow-500 animate-pulse'
                                : 'bg-gray-300'
                          }`}
                          title={
                            isConnected
                              ? 'Connected'
                              : isConnecting
                                ? 'Connecting...'
                                : 'Disconnected'
                          }
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      Last seen: {new Date(device.lastSeen).toLocaleString()}
                    </p>
                  </div>
                  {switching === device.deviceId && (
                    <span className="text-xs text-blue-500">Switching...</span>
                  )}
                  {confirmRevoke === device.deviceId ? (
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                        onClick={() => handleRevoke(device.deviceId)}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300 transition-colors"
                        onClick={() => setConfirmRevoke(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-md font-medium hover:bg-red-200 transition-colors shrink-0"
                      onClick={() => setConfirmRevoke(device.deviceId)}
                    >
                      Forget
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);
