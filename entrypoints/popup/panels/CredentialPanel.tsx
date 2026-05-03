import { useEffect } from 'react';
import { useAppStore } from '~/lib/store';

export function CredentialPanel() {
  const credentialState = useAppStore((s) => s.credentialState);
  const credentialDomain = useAppStore((s) => s.credentialDomain);
  const credentialStatus = useAppStore((s) => s.credentialStatus);
  const setCredentialState = useAppStore((s) => s.setCredentialState);
  const setCredentialDomain = useAppStore((s) => s.setCredentialDomain);
  const setCredentialStatus = useAppStore((s) => s.setCredentialStatus);

  useEffect(() => {
    if (credentialState === 'filled' || credentialState === 'not_found' || credentialState === 'error') {
      const timer = setTimeout(() => {
        setCredentialState('idle');
        setCredentialDomain(null);
        setCredentialStatus(null);
      }, 5000);
      return () => {
        clearTimeout(timer);
      };
    }
    return;
  }, [credentialState, setCredentialState, setCredentialDomain, setCredentialStatus]);

  if (credentialState === 'filled') {
    return (
      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h2 className="text-sm font-semibold text-green-700">Credentials filled</h2>
        </div>
        {credentialDomain && (
          <p className="text-xs text-green-600">Automatically filled on {credentialDomain}</p>
        )}
      </div>
    );
  }

  if (credentialState === 'not_found') {
    return (
      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <h2 className="text-sm font-semibold text-yellow-700 mb-1">No credentials found</h2>
        {credentialDomain && (
          <p className="text-xs text-yellow-600">No saved credentials for {credentialDomain}</p>
        )}
      </div>
    );
  }

  if (credentialState === 'requesting') {
    return (
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-sm font-semibold text-blue-700">Requesting credentials</h2>
        </div>
        {credentialDomain && (
          <p className="text-xs text-blue-600">Contacting phone for {credentialDomain}</p>
        )}
      </div>
    );
  }

  if (credentialState === 'waiting_phone') {
    return (
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-sm font-semibold text-blue-700">Waiting for phone authentication...</h2>
        </div>
        {credentialDomain && (
          <p className="text-xs text-blue-600">Approve on your phone to fill {credentialDomain}</p>
        )}
      </div>
    );
  }

  if (credentialState === 'detecting') {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h2 className="text-sm font-semibold text-gray-600">
          {credentialStatus || 'Login detected'}
        </h2>
        {credentialDomain && (
          <p className="text-xs text-gray-500">on {credentialDomain}</p>
        )}
      </div>
    );
  }

  if (credentialState === 'error') {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
        <h2 className="text-sm font-semibold text-red-700 mb-1">Credential error</h2>
        <p className="text-xs text-red-600">{credentialStatus || 'An error occurred'}</p>
      </div>
    );
  }

  return null;
}
