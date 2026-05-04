import { useEffect, useState, useCallback } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '~/lib/store';
import type { AttestationStatus as AttestationStatusType } from '~/lib/attestation';

export function AttestationStatus() {
  const attestation = useAppStore((s) => s.attestation);
  const setAttestation = useAppStore((s) => s.setAttestation);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [refreshSuccess, setRefreshSuccess] = useState<boolean | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({ type: 'get-attestation-status' });
      if (response.success) {
        const status = response.data?.status as AttestationStatusType | undefined;
        if (status) {
          setAttestation(status);
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('AttestationStatus fetch error:', err);
      }
    }
  }, [setAttestation]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshResult(null);
    setRefreshSuccess(null);
    try {
      const response = await browser.runtime.sendMessage({ type: 'refresh-rp-keys' });
      if (response.success) {
        setRefreshResult('Keys refreshed successfully');
        setRefreshSuccess(true);
        await fetchStatus();
      } else {
        setRefreshResult(response.error ?? 'Refresh failed');
        setRefreshSuccess(false);
      }
    } catch (err) {
      setRefreshResult(err instanceof Error ? err.message : 'Refresh failed');
      setRefreshSuccess(false);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStatus]);

  if (attestation.type === 'not_applicable') return null;

  const statusColors: Record<string, string> = {
    verified: 'bg-green-50 border-green-200 text-green-800',
    dom_only: 'bg-amber-50 border-amber-200 text-amber-800',
    rat_detected: 'bg-red-50 border-red-200 text-red-800',
  };

  const statusLabels: Record<string, string> = {
    verified: 'Attestation Verified',
    dom_only: 'DOM-only (no attestation)',
    rat_detected: 'RAT Attack Detected!',
  };

  const color = statusColors[attestation.type] ?? 'bg-gray-50 border-gray-200 text-gray-600';

  return (
    <div className={`p-3 rounded-lg border text-xs ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{statusLabels[attestation.type] ?? attestation.type}</span>
        <button
          type="button"
          className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-40"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? '...' : 'Refresh Keys'}
        </button>
      </div>
      {(attestation.type === 'verified' || attestation.type === 'rat_detected') && (
        <>
          <p className="opacity-80">Domain: {attestation.attestedCode.rpDomain}</p>
          <p className="opacity-80 font-mono">Code: {attestation.attestedCode.controlCode}</p>
        </>
      )}
      {attestation.type === 'rat_detected' && (
        <p className="mt-1 font-bold text-red-700">
          Control code mismatch! Using attested (server-signed) code.
          <br />
          <span className="font-normal">DOM code: {attestation.domCode}</span>
        </p>
      )}
      {attestation.type === 'dom_only' && (
        <p className="mt-1 opacity-80">No server attestation header received.</p>
      )}
      {refreshResult && (
        <p className={`mt-1 ${refreshSuccess === true ? 'text-green-700' : 'text-red-700'}`}>
          {refreshResult}
        </p>
      )}
    </div>
  );
}
