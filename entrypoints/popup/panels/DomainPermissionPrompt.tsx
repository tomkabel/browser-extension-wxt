import { useCallback } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '~/lib/store';

export function DomainPermissionPrompt() {
  const pendingDomains = useAppStore((s) => s.pendingDomains);
  const setPendingDomains = useAppStore((s) => s.setPendingDomains);

  const handleAllow = useCallback(
    async (domain: string) => {
      await browser.runtime.sendMessage({
        type: 'domain-approved',
        payload: { domain },
      });
      setPendingDomains(pendingDomains.filter((d) => d.domain !== domain));
    },
    [pendingDomains, setPendingDomains],
  );

  const handleDeny = useCallback(
    async (domain: string) => {
      await browser.runtime.sendMessage({
        type: 'domain-denied',
        payload: { domain },
      });
      setPendingDomains(pendingDomains.filter((d) => d.domain !== domain));
    },
    [pendingDomains, setPendingDomains],
  );

  if (pendingDomains.length === 0) return null;

  return (
    <div className="space-y-2" role="region" aria-label="New domain permission">
      <h2 className="text-sm font-bold text-gray-800">New Domain</h2>
      {pendingDomains.map((d) => (
        <div key={d.domain} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-sm font-medium text-gray-800 truncate">{d.domain}</p>
          <p className="text-xs text-gray-500 mt-1 truncate">Allow credential auto-fill for this domain?</p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              className="flex-1 py-1.5 bg-green-600 text-white text-sm rounded-md font-medium hover:bg-green-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              onClick={() => handleAllow(d.domain)}
            >
              Allow
            </button>
            <button
              type="button"
              className="flex-1 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md font-medium hover:bg-gray-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              onClick={() => handleDeny(d.domain)}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
