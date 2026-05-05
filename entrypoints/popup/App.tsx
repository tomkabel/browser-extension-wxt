import { Suspense, lazy, useEffect, useRef } from 'react';
import { browser } from 'wxt/browser';
import './style.css';
import { useAppStore } from '~/lib/store';
import { ErrorBoundary } from './ErrorBoundary';
import { AttestationStatus } from './panels/AttestationStatus';
import { DomainPermissionPrompt } from './panels/DomainPermissionPrompt';
import { SettingsPanel } from './panels/SettingsPanel';

const PairingPanel = lazy(() =>
  import('./panels/PairingPanel').then((m) => ({ default: m.PairingPanel })),
);
const AuthPanel = lazy(() => import('./panels/AuthPanel').then((m) => ({ default: m.AuthPanel })));
const TransactionPanel = lazy(() =>
  import('./panels/TransactionPanel').then((m) => ({ default: m.TransactionPanel })),
);
const CredentialPanel = lazy(() =>
  import('./panels/CredentialPanel').then((m) => ({ default: m.CredentialPanel })),
);
const DeviceListPanel = lazy(() =>
  import('./panels/DeviceListPanel').then((m) => ({ default: m.DeviceListPanel })),
);

function LoadingFallback() {
  return <div className="animate-pulse h-8 bg-gray-200 rounded"></div>;
}

function PanelRouter() {
  const pairingState = useAppStore((s) => s.pairingState);
  const sessionState = useAppStore((s) => s.sessionState);
  const credentialState = useAppStore((s) => s.credentialState);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [pairingState, sessionState, credentialState]);

  if (
    pairingState === 'unpaired' ||
    pairingState === 'displaying_qr' ||
    pairingState === 'waiting_for_handshake' ||
    pairingState === 'error'
  ) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PairingPanel ref={headingRef} />
      </Suspense>
    );
  }

  if (pairingState === 'paired') {
    if (credentialState && credentialState !== 'idle') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <CredentialPanel ref={headingRef} />
        </Suspense>
      );
    }

    if (sessionState === 'active' || sessionState === 'expiring') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <TransactionPanel ref={headingRef} />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<LoadingFallback />}>
        <AuthPanel ref={headingRef} />
      </Suspense>
    );
  }

  return (
    <div className="p-4 text-center">
      <p className="text-sm text-gray-600">Loading...</p>
    </div>
  );
}

function PopupApp() {
  const showSettings = useAppStore((s) => s.showSettings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const showDevices = useAppStore((s) => s.showDevices);
  const setShowDevices = useAppStore((s) => s.setShowDevices);
  const setPendingDomains = useAppStore((s) => s.setPendingDomains);
  const devicesHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (showDevices) {
      devicesHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [showDevices]);

  useEffect(() => {
    let mounted = true;
    async function loadPendingDomains() {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'get-pending-domains',
          payload: null,
        });
        if (mounted && response?.success && response?.data) {
          const pending = (response.data.pending as Array<{ domain: string; url: string }>) ?? [];
          setPendingDomains(pending);
        }
      } catch {
        if (mounted) setPendingDomains([]);
      }
    }
    loadPendingDomains();
    return () => {
      mounted = false;
    };
  }, [setPendingDomains]);

  return (
    <div className="w-96 p-4 bg-white">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">S2</span>
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-800">SmartID2</h1>
          <p className="text-xs text-gray-500">Secure Transaction Verification</p>
        </div>
        <button
          type="button"
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={() => {
            const next = !showDevices;
            setShowDevices(next);
            if (next) setShowSettings(false);
          }}
          title="Devices"
          aria-label="Devices"
          aria-pressed={showDevices}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </button>
        <button
          type="button"
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={() => {
            const next = !showSettings;
            setShowSettings(next);
            if (next) setShowDevices(false);
          }}
          title="Settings"
          aria-label="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {showSettings ? (
          <ErrorBoundary>
            <SettingsPanel />
          </ErrorBoundary>
        ) : showDevices ? (
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <DeviceListPanel ref={devicesHeadingRef} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <>
            <ErrorBoundary>
              <DomainPermissionPrompt />
            </ErrorBoundary>
            <ErrorBoundary>
              <PanelRouter />
            </ErrorBoundary>
            <ErrorBoundary>
              <AttestationStatus />
            </ErrorBoundary>
          </>
        )}
      </div>

      <div className="mt-4 pt-3 border-t text-center">
        <p className="text-xs text-gray-400">SmartID2 Extension v1</p>
      </div>
    </div>
  );
}

export default PopupApp;
