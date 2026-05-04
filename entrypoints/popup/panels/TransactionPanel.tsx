import { useState, useCallback } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '~/lib/store';
import { SessionStatus } from './SessionStatus';

export function TransactionPanel() {
  const transactionState = useAppStore((s) => s.transactionState);
  const transactionData = useAppStore((s) => s.transactionData);
  const sessionExpiry = useAppStore((s) => s.sessionExpiry);
  const setTransactionState = useAppStore((s) => s.setTransactionState);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    setTransactionState('verifying');
    setError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: 'verify-transaction',
        payload: transactionData,
      });

      if (response.success) {
        const verdict = response.data?.verdict as string | undefined;
        if (verdict === 'confirmed') {
          setTransactionState('confirmed');
        } else if (verdict === 'rejected') {
          setTransactionState('rejected');
        }
      } else {
        setTransactionState('rejected');
        setError(response.error ?? 'Verification failed');
      }
    } catch (err) {
      setTransactionState('rejected');
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [transactionData, setTransactionState]);

  const handleNewTransaction = useCallback(() => {
    setTransactionState('idle');
    setError(null);
  }, [setTransactionState]);

  const hasData = transactionData.amount != null || transactionData.recipient != null;

  if (transactionState === 'confirmed') {
    return (
      <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
        <h2 className="text-lg font-bold text-green-800 mb-2">Confirmed</h2>
        <p className="text-green-700 text-sm">Transaction verified on your phone</p>
        <button
          type="button"
          className="mt-3 px-4 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors"
          onClick={handleNewTransaction}
        >
          Done
        </button>
      </div>
    );
  }

  if (transactionState === 'rejected') {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-center">
        <h2 className="text-lg font-bold text-red-800 mb-2">Rejected</h2>
        <p className="text-red-600 text-sm">{error ?? 'Transaction was rejected on your phone'}</p>
        <button
          type="button"
          className="mt-3 px-4 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors"
          onClick={handleNewTransaction}
        >
          OK
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg border">
      <h2 className="text-lg font-bold text-gray-800 mb-3">Transaction</h2>

      {sessionExpiry && (
        <div className="mb-3">
          <SessionStatus expiry={sessionExpiry} />
        </div>
      )}

      {hasData ? (
        <div className="space-y-2 mb-4">
          {transactionData.recipient && (
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span className="text-xs text-gray-500">Recipient</span>
              <span className="text-sm font-mono font-medium text-gray-800 truncate max-w-[180px]">
                {transactionData.recipient}
              </span>
            </div>
          )}
          {transactionData.amount && (
            <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span className="text-xs text-gray-500">Amount</span>
              <span className="text-sm font-mono font-bold text-gray-800">
                {transactionData.amount}
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">No transaction detected</p>
      )}

      {hasData && transactionState === 'idle' && (
        <button
          type="button"
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          onClick={handleVerify}
        >
          Verify on Phone
        </button>
      )}

      {transactionState === 'verifying' && (
        <div className="text-center py-3">
          <div className="animate-spin h-6 w-6 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-gray-500">Waiting for phone verification...</p>
          <p className="text-xs text-gray-400 mt-1">Challenge-Bound WebAuthn assertion in progress</p>
        </div>
      )}
    </div>
  );
}
