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
  const assertionStatus = useAppStore((s) => s.assertionStatus);
  const assertionError = useAppStore((s) => s.assertionError);
  const setAssertionStatus = useAppStore((s) => s.setAssertionStatus);
  const setAssertionError = useAppStore((s) => s.setAssertionError);
  const transactionData = useAppStore((s) => s.transactionData);
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
    setAssertionStatus('idle');
    setAssertionError(null);
  }, [setSessionState, setSessionExpiry, setSessionRemaining, setAssertionStatus, setAssertionError]);

  const renderAssertionStatus = () => {
    switch (assertionStatus) {
      case 'pending':
        return (
          <div className="text-center py-3">
            <div className="animate-spin h-6 w-6 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-medium">Waiting for biometric verification...</p>
            <p className="text-xs text-gray-400 mt-1">Touch your fingerprint sensor or use Face ID</p>
          </div>
        );
      case 'verified':
        return (
          <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
            <p className="text-green-700 text-sm font-medium">Transaction verified via Challenge-Bound WebAuthn</p>
          </div>
        );
      case 'timeout':
        return (
          <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
            <p className="text-red-700 text-sm font-medium">Biometric verification timed out</p>
            <p className="text-xs text-red-500 mt-1">Please try again</p>
          </div>
        );
      case 'error':
        return (
          <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
            <p className="text-red-700 text-sm font-medium">Verification failed</p>
            {assertionError && <p className="text-xs text-red-500 mt-1">{assertionError}</p>}
          </div>
        );
      default:
        return null;
    }
  };

  const showTransactionContext = assertionStatus === 'pending' || assertionStatus === 'idle';
  const hasTransactionContext = transactionData.amount || transactionData.recipient;

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

  if (assertionStatus === 'verified') {
    return (
      <div className="p-4 bg-white rounded-lg border">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Transaction Verified</h2>
        {renderAssertionStatus()}
        <button
          type="button"
          className="mt-3 w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          onClick={handleAuthenticate}
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg border">
      <h2 className="text-lg font-bold text-gray-800 mb-3">Authenticate</h2>
      <p className="text-sm text-gray-500 mb-4">
        Verify your identity to enable transaction signing on this device.
      </p>

      {hasTransactionContext && showTransactionContext && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border space-y-2">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Transaction Context</p>
          {transactionData.recipient && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Recipient</span>
              <span className="text-sm font-mono font-medium text-gray-800 truncate max-w-[180px]">
                {transactionData.recipient}
              </span>
            </div>
          )}
          {transactionData.amount && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Amount</span>
              <span className="text-sm font-mono font-bold text-gray-800">
                {transactionData.amount}
              </span>
            </div>
          )}
          <p className="text-xs text-amber-600 mt-1">
            This transaction will be cryptographically bound to your biometric verification
          </p>
        </div>
      )}

      {renderAssertionStatus()}

      {(assertionStatus === 'idle' || assertionStatus === 'timeout' || assertionStatus === 'error') && (
        <button
          type="button"
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          onClick={handleAuthenticate}
        >
          {assertionStatus === 'timeout' ? 'Try Again' : 'Authenticate'}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}
