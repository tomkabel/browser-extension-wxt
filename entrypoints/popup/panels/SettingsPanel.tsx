import { useEffect, useCallback, useState } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '~/lib/store';

export function SettingsPanel() {
  const approvedDomains = useAppStore((s) => s.approvedDomains);
  const setApprovedDomains = useAppStore((s) => s.setApprovedDomains);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'get-approved-domains',
          payload: null,
        });
        if (!mounted) return;
        if (response.success) {
          setApprovedDomains(response.data.domains);
        } else {
          setLoadError(response.error ?? 'Failed to load domains');
        }
      } catch {
        if (mounted) setLoadError('Failed to connect to background worker');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [setApprovedDomains]);

  const handleRevoke = useCallback(
    async (domain: string) => {
      await browser.runtime.sendMessage({
        type: 'domain-denied',
        payload: { domain },
      });
      setApprovedDomains(approvedDomains.filter((d) => d.domain !== domain));
    },
    [approvedDomains, setApprovedDomains],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800">Approved Domains</h2>
        <button
          type="button"
          className="text-xs text-blue-600 hover:text-blue-800"
          onClick={() => setShowSettings(false)}
        >
          Back
        </button>
      </div>

      {loadError && (
        <p className="text-xs text-red-500 text-center py-2" role="alert">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-4">Loading...</p>
      ) : approvedDomains.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No approved domains</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {approvedDomains.map((d) => (
            <div
              key={d.domain}
              className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{d.domain}</p>
                <p className="text-xs text-gray-400">
                  {new Date(d.registeredAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                className="ml-2 px-2.5 py-1 bg-red-100 text-red-700 text-xs rounded-md font-medium hover:bg-red-200 transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                onClick={() => handleRevoke(d.domain)}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
