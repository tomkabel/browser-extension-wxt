import { useState, useEffect, useCallback } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '~/lib/store';
import { SessionStatus } from './SessionStatus';

export function AuthPanel() {
  const sessionState = useAppStore((s) => s.sessionState);
  const sessionExpiry = useAppStore((s) => s.sessionExpiry);
  const setSessionState = useAppStore((s) => s.setSessionState);
  const setSessionExpiry = useAppStore((s) => s.setSessionExpiry);
  const setSessionRemaining = useAppStore((s) => s.setSessionRemaining);
  const pairingState = useAppStore((s) => s.pairingState);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'check-session',
          payload: null,
        });

        if (!mounted) return;

        if (response.success && response.data?.active) {
          const expiryMs =
            typeof response.data?.expiry === 'number' ? response.data.expiry : Date.now() + 300000;
          setSessionState('active');
          setSessionExpiry(expiryMs);
          setSessionRemaining(Math.max(0, Math.floor((expiryMs - Date.now()) / 1000)));
        }
      } catch {
        if (mounted) setSessionState('none');
      } finally {
        if (mounted) setChecking(false);
      }
    }

    if (pairingState === 'paired') {
      checkSession();
    } else {
      setChecking(false);
    }

    return () => {
      mounted = false;
    };
  }, [pairingState, setSessionState, setSessionExpiry, setSessionRemaining]);

  const handleAuthenticate = useCallback(async () => {
    try {
      const authUrl = chrome.runtime.getURL('auth.html');
      await browser.tabs.create({ url: authUrl });
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open authentication page');
    }
  }, []);

  const handleReauth = useCallback(() => {
    setSessionState('none');
    setSessionExpiry(null);
    setSessionRemaining(null);
    setError(null);
  }, [setSessionState, setSessionExpiry, setSessionRemaining]);

  if (checking) {
    return (
      <div className="p-4 bg-white rounded-lg border">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (sessionState === 'expired' && sessionExpiry) {
    return (
      <div className="p-4 bg-white rounded-lg border">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Authentication</h2>
        <SessionStatus expiry={sessionExpiry} />
        <div className="mt-3 text-center">
          <button
            type="button"
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            onClick={handleReauth}
          >
            Re-authenticate
          </button>
        </div>
      </div>
    );
  }

  if (sessionState === 'active' || sessionState === 'expiring') {
    return (
      <div className="p-4 bg-white rounded-lg border">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Authentication</h2>
        {sessionExpiry && <SessionStatus expiry={sessionExpiry} />}
        <p className="text-sm text-green-600 text-center mt-2 font-medium">Session active</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg border">
      <h2 className="text-lg font-bold text-gray-800 mb-3">Authenticate</h2>
      <p className="text-sm text-gray-500 mb-4">
        Verify your identity to enable transaction signing on this device.
      </p>
      <button
        type="button"
        className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        onClick={handleAuthenticate}
      >
        Authenticate
      </button>
      {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}
