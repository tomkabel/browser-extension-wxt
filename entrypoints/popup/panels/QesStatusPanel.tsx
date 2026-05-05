import { useEffect, useCallback, useRef } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '~/lib/store';
import type { QesState, QesStatus } from '~/types';

type StateView = {
  icon: string;
  label: string;
  container: string;
  text: string;
  accent: string;
};

const STATE_VIEWS: Record<QesState, StateView | null> = {
  idle: null,
  armed: { icon: '⏳', label: 'QES SIGNATURE ARMED', container: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-800', accent: 'text-yellow-700' },
  waiting: { icon: '⏳', label: 'QES SIGNATURE ARMED', container: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-800', accent: 'text-yellow-700' },
  executing: { icon: '⚡', label: 'QES EXECUTING', container: 'bg-blue-50 border-blue-300', text: 'text-blue-800', accent: 'text-blue-700' },
  completed: { icon: '✅', label: 'QES COMPLETED', container: 'bg-green-50 border-green-300', text: 'text-green-800', accent: 'text-green-700' },
  cancelled: { icon: '✋', label: 'QES CANCELLED', container: 'bg-red-50 border-red-300', text: 'text-red-800', accent: 'text-red-700' },
  timeout: { icon: '⏰', label: 'QES TIMEOUT', container: 'bg-red-50 border-red-300', text: 'text-red-800', accent: 'text-red-700' },
};

function AuditTrail({ auditEntry, isSuccess }: { auditEntry: string; isSuccess: boolean }) {
  const summaryClass = isSuccess ? 'text-green-600' : 'text-red-600';
  const preClass = isSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

  return (
    <details className="mt-1">
      <summary className={`text-xs cursor-pointer hover:underline ${summaryClass}`}>
        Audit trail
      </summary>
      <pre className={`text-xs mt-1 whitespace-pre-wrap font-mono p-2 rounded ${preClass}`}>
        {auditEntry}
      </pre>
    </details>
  );
}

export function QesStatusPanel() {
  const qesState = useAppStore((s) => s.qesState);
  const qesStatus = useAppStore((s) => s.qesStatus);
  const setQesState = useAppStore((s) => s.setQesState);
  const setQesStatus = useAppStore((s) => s.setQesStatus);
  const mountedRef = useRef(true);

  const readStatus = useCallback(async () => {
    try {
      const stored = await browser.storage.session.get('qes:status');
      const data = stored['qes:status'] as QesStatus | undefined;
      if (data && mountedRef.current) {
        setQesState(data.state);
        setQesStatus(data);
      }
    } catch {
      if (mountedRef.current) {
        setQesState('idle');
        setQesStatus(null);
      }
    }
  }, [setQesState, setQesStatus]);

  useEffect(() => {
    readStatus();
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'session') return;
      const qesChange = changes['qes:status'];
      if (qesChange?.newValue && mountedRef.current) {
        const data = qesChange.newValue as QesStatus;
        setQesState(data.state);
        setQesStatus(data);
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      mountedRef.current = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [readStatus, setQesState, setQesStatus]);

  if (qesState === 'idle' || !qesStatus) return null;

  const view = STATE_VIEWS[qesState];
  if (!view) return null;

  if (qesState === 'executing') {
    return (
      <div className={`p-3 rounded-lg border ${view.container}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{view.icon}</span>
          <span className={`text-sm font-bold ${view.text}`}>{view.label}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" />
          <p className={`text-xs ${view.accent}`}>Executing signature...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg border ${view.container}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{view.icon}</span>
        <span className={`text-sm font-bold ${view.text}`}>{view.label}</span>
      </div>

      {(qesState === 'armed' || qesState === 'waiting') && (
        <div>
          <p className={`text-xs mt-1 ${view.accent}`}>Verify transaction on your phone.</p>
          <p className={`text-xs ${view.accent}`}>Press VOLUME DOWN on phone to authorize.</p>
          {qesStatus.countdownSeconds != null && (
            <p className={`text-xs font-mono mt-1 ${view.accent}`}>
              Expires in: {qesStatus.countdownSeconds}s
            </p>
          )}
        </div>
      )}

      {qesState === 'completed' && (
        <p className={`text-xs mt-1 ${view.accent}`}>
          Signature completed via {qesStatus.interruptType ?? 'Volume Down'}
        </p>
      )}

      {(qesState === 'cancelled' || qesState === 'timeout') && (
        <p className={`text-xs mt-1 ${view.accent}`}>
          {qesState === 'cancelled'
            ? 'QES cancelled — no signature was created'
            : 'QES timed out — no signature was created'}
        </p>
      )}

      {qesStatus.auditEntry && (
        <AuditTrail auditEntry={qesStatus.auditEntry} isSuccess={qesState === 'completed'} />
      )}
    </div>
  );
}
