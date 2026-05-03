import { useState, useEffect } from 'react';
import { useAppStore } from '~/lib/store';

interface SessionStatusProps {
  expiry: number;
}

export function SessionStatus({ expiry }: SessionStatusProps) {
  const sessionState = useAppStore((s) => s.sessionState);
  const setSessionState = useAppStore((s) => s.setSessionState);
  const setSessionRemaining = useAppStore((s) => s.setSessionRemaining);
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    function tick() {
      const now = Date.now();
      const rem = Math.max(0, Math.floor((expiry - now) / 1000));
      if (!mounted) return;

      setRemaining(rem);
      setSessionRemaining(rem);

      if (rem <= 0) {
        setSessionState('expired');
        if (interval) clearInterval(interval);
      } else if (rem <= 30 && sessionState === 'active') {
        setSessionState('expiring');
      }
    }

    tick();
    interval = setInterval(tick, 1000);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [expiry, sessionState, setSessionState, setSessionRemaining]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  if (sessionState === 'expired') {
    return (
      <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
        <p className="text-red-700 font-semibold text-sm mb-2">Session expired</p>
        <p className="text-red-600 text-xs mb-3">
          Your session has timed out. Please re-authenticate.
        </p>
        <button
          type="button"
          className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors"
          onClick={() => {
            setSessionState('none');
            setSessionRemaining(null);
          }}
        >
          Re-authenticate
        </button>
      </div>
    );
  }

  if (sessionState === 'expiring') {
    return (
      <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-center">
        <p className="text-amber-700 text-xs font-medium">
          Session expiring in{' '}
          <span className="tabular-nums font-mono font-bold">{timeDisplay}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="p-2 bg-gray-50 rounded-lg border text-center">
      <p className="text-gray-500 text-xs">
        Session:{' '}
        <span className="tabular-nums font-mono text-gray-700 font-medium">{timeDisplay}</span>
      </p>
    </div>
  );
}
