import { Suspense, lazy } from 'react';
import './style.css';
import { useAppStore } from '~/lib/store';
import { ErrorBoundary } from './ErrorBoundary';
import { AttestationStatus } from './panels/AttestationStatus';

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

function LoadingFallback() {
  return <div className="animate-pulse h-8 bg-gray-200 rounded"></div>;
}

function PanelRouter() {
  const pairingState = useAppStore((s) => s.pairingState);
  const sessionState = useAppStore((s) => s.sessionState);
  const credentialState = useAppStore((s) => s.credentialState);

  if (
    pairingState === 'unpaired' ||
    pairingState === 'displaying_qr' ||
    pairingState === 'waiting_for_handshake' ||
    pairingState === 'error'
  ) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PairingPanel />
      </Suspense>
    );
  }

  if (pairingState === 'paired') {
    if (credentialState && credentialState !== 'idle') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <CredentialPanel />
        </Suspense>
      );
    }

    if (sessionState === 'active' || sessionState === 'expiring') {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <TransactionPanel />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<LoadingFallback />}>
        <AuthPanel />
      </Suspense>
    );
  }

  return (
    <div className="p-4 text-center">
      <p className="text-sm text-gray-500">Loading...</p>
    </div>
  );
}

function PopupApp() {
  return (
    <div className="w-96 p-4 bg-white">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">S2</span>
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-800">SmartID2</h1>
          <p className="text-xs text-gray-500">Secure Transaction Verification</p>
        </div>
      </div>

      <div className="space-y-3">
        <ErrorBoundary>
          <PanelRouter />
        </ErrorBoundary>
        <ErrorBoundary>
          <AttestationStatus />
        </ErrorBoundary>
      </div>

      <div className="mt-4 pt-3 border-t text-center">
        <p className="text-xs text-gray-400">SmartID2 Extension v1</p>
      </div>
    </div>
  );
}

export default PopupApp;
