import { useEffect, useState } from 'react';
import { useAppStore } from '~/lib/store';
import { browser } from 'wxt/browser';

export function TransportIndicator() {
  const activeTransport = useAppStore((s) => s.activeTransport);
  const usbAvailable = useAppStore((s) => s.usbAvailable);
  const setActiveTransport = useAppStore((s) => s.setActiveTransport);
  const setUsbAvailable = useAppStore((s) => s.setUsbAvailable);
  const transportChangeMessage = useAppStore((s) => s.transportChangeMessage);
  const setTransportChangeMessage = useAppStore((s) => s.setTransportChangeMessage);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    let mounted = true;

    browser.runtime.sendMessage({ type: 'transport-changed', payload: null }).then((response) => {
      if (!mounted || !response?.success) return;
      const data = response.data as { activeTransport?: string; usbAvailable?: boolean };
      if (data.activeTransport) {
        setActiveTransport(data.activeTransport as 'usb' | 'webrtc');
      }
      if (data.usbAvailable !== undefined) {
        setUsbAvailable(data.usbAvailable);
      }
    }).catch(() => {
      // transport manager not ready
    });

    const listener = (message: { type?: string; payload?: unknown }) => {
      if (message.type === 'transport-changed' && message.payload) {
        const { current, reason } = message.payload as { current: string; reason: string };
        setActiveTransport(current as 'usb' | 'webrtc');
        setTransportChangeMessage(reason);
        setShowToast(true);
        setTimeout(() => {
          if (mounted) {
            setShowToast(false);
            setTransportChangeMessage(null);
          }
        }, 3000);
      }
    };

    browser.runtime.onMessage.addListener(listener);

    return () => {
      mounted = false;
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [setActiveTransport, setUsbAvailable, setTransportChangeMessage]);

  if (!activeTransport) {
    return (
      <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
        <span className="text-gray-500" aria-hidden="true">⚪</span>
        <span className="text-gray-500">No transport</span>
      </div>
    );
  }

  const icon = activeTransport === 'usb' ? '🔗' : '🌐';
  const label = activeTransport === 'usb' ? 'USB' : 'WebRTC';
  const statusColor = activeTransport === 'usb' ? 'text-green-600' : 'text-blue-600';

  return (
    <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
      <span className={statusColor} aria-hidden="true">{icon}</span>
      <span className={statusColor}>{label}</span>
      {usbAvailable && activeTransport !== 'usb' && (
        <span className="text-gray-500">(USB available)</span>
      )}

      {showToast && transportChangeMessage && (
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-3 py-1.5 rounded-md text-xs shadow-lg transition-opacity">
          Switched to {label}: {transportChangeMessage}
        </div>
      )}
    </div>
  );
}
