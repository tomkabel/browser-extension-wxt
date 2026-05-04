import { useState, useEffect, useRef, useCallback } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '~/lib/store';
import type { AppStore } from '~/lib/store';
import {
  generateSasCode,
  buildPairingUrl,
  drawQrCode,
  SAS_TTL_MS,
  detectAccessibilityPrefs,
} from '~/lib/channel/qrCode';

export function PairingPanel() {
  const pairingState = useAppStore((s) => s.pairingState);
  const pairingError = useAppStore((s) => s.pairingError);
  const sasCode = useAppStore((s) => s.sasCode);
  const deviceName = useAppStore((s) => s.deviceName);
  const sasMode = useAppStore((s) => s.sasMode);
  const emojiSas = useAppStore((s) => s.emojiSas);
  const connectionState = useAppStore((s) => s.connectionState);
  const setPairingState = useAppStore((s) => s.setPairingState);
  const setPairingError = useAppStore((s) => s.setPairingError);
  const setSasCode = useAppStore((s) => s.setSasCode);
  const setDeviceName = useAppStore((s) => s.setDeviceName);
  const setSasMode = useAppStore((s) => s.setSasMode);
  const setEmojiSas = useAppStore((s) => s.setEmojiSas);
  const setConnectionState = useAppStore((s) => s.setConnectionState);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generatedAt, setGeneratedAt] = useState<number>(0);

  const startPairing = useCallback(async () => {
    setPairingState('displaying_qr');
    setPairingError(null);

    const prefs = detectAccessibilityPrefs();
    if (prefs.screenReader || prefs.reducedMotion) {
      setSasMode('numeric');
    } else {
      setSasMode('emoji');
    }

    const code = generateSasCode();
    setSasCode(code);
    setGeneratedAt(Date.now());

    try {
      const response = await browser.runtime.sendMessage({
        type: 'start-pairing',
        payload: { sasCode: code, pairingUrl: buildPairingUrl(code) },
      });

      if (!response.success) {
        setPairingState('error');
        setPairingError(response.error ?? 'Pairing initiation failed');
      }
    } catch (err) {
      setPairingState('error');
      setPairingError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [setPairingState, setPairingError, setSasCode, setSasMode]);

  useEffect(() => {
    let mounted = true;

    if (pairingState === 'displaying_qr' && canvasRef.current && sasCode) {
      const pairingUrl = buildPairingUrl(sasCode);
      drawQrCode(pairingUrl, canvasRef.current).catch(() => {});
    }

    if (pairingState === 'displaying_qr') {
      const check = setInterval(async () => {
        if (!mounted) return;
        const response = await browser.runtime.sendMessage({
          type: 'check-session',
          payload: null,
        });

        if (!mounted) return;

        if (response.success && response.data?.paired) {
          setPairingState('paired');
          setDeviceName(response.data.deviceName ?? 'Paired device');
          clearInterval(check);
          clearTimeout(timeout);
          return;
        }

        if (response.success && response.data?.emojiSas) {
          setEmojiSas(response.data.emojiSas as [string, string, string]);
          setPairingState('awaiting_sas_confirmation');
          clearInterval(check);
          clearTimeout(timeout);
          return;
        }

        if (response.success && response.data?.connectionState) {
          setConnectionState(response.data.connectionState as AppStore['connectionState']);
        }
      }, 2000);

      const timeout = setTimeout(() => {
        if (mounted) {
          setPairingState('error');
          setPairingError('QR code expired. Please try again.');
          clearInterval(check);
        }
      }, SAS_TTL_MS);

      return () => {
        mounted = false;
        clearInterval(check);
        clearTimeout(timeout);
      };
    }

    return () => {
      mounted = false;
    };
  }, [
    pairingState,
    sasCode,
    setPairingState,
    setPairingError,
    setDeviceName,
    setEmojiSas,
    setConnectionState,
  ]);

  const handleConfirmMatch = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'pairing-confirmed',
        payload: null,
      });

      if (response.success) {
        setPairingState('paired');
        setDeviceName('Paired device');
      } else {
        setPairingState('error');
        setPairingError(response.error ?? 'Confirmation failed');
      }
    } catch (err) {
      setPairingState('error');
      setPairingError(err instanceof Error ? err.message : 'Confirmation failed');
    }
  }, [setPairingState, setPairingError, setDeviceName]);

  const handleRejectMatch = useCallback(async () => {
    try {
      await browser.runtime.sendMessage({
        type: 'pairing-rejected',
        payload: null,
      });
    } catch {
      // background will clean up regardless
    }

    setPairingState('unpaired');
    setPairingError(null);
    setSasCode(null);
    setDeviceName(null);
    setEmojiSas(null);
    setGeneratedAt(0);
  }, [setPairingState, setPairingError, setSasCode, setDeviceName, setEmojiSas]);

  const handleReset = useCallback(() => {
    setPairingState('unpaired');
    setPairingError(null);
    setSasCode(null);
    setDeviceName(null);
    setEmojiSas(null);
    setGeneratedAt(0);
  }, [setPairingState, setPairingError, setSasCode, setDeviceName, setEmojiSas]);

  const handleToggleSasMode = useCallback(() => {
    const newMode = sasMode === 'emoji' ? 'numeric' : 'emoji';
    setSasMode(newMode);
  }, [sasMode, setSasMode]);

  if (pairingState === 'unpaired') {
    return (
      <div className="p-4 bg-white rounded-lg border">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Pair with Phone</h2>
        <p className="text-sm text-gray-500 mb-4">
          Connect your Android phone to enable transaction verification via the SmartID2 companion
          app.
        </p>
        <button
          type="button"
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          onClick={startPairing}
        >
          Pair Phone
        </button>
      </div>
    );
  }

  const remainingSeconds = Math.max(0, Math.ceil((SAS_TTL_MS - (Date.now() - generatedAt)) / 1000));

  if (pairingState === 'displaying_qr') {
    const showEmoji = sasMode === 'emoji';
    const showNumeric = sasMode === 'numeric';

    if (
      connectionState === 'disconnected' &&
      generatedAt > 0 &&
      Date.now() - generatedAt > 15_000
    ) {
      return (
        <div className="p-4 bg-white rounded-lg border text-center">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Unable to Connect</h2>
          <p className="text-sm text-gray-500 mb-4">Check your network and try again.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              onClick={() => {
                setPairingState('unpaired');
                setPairingError(null);
                setSasCode(null);
                setDeviceName(null);
                setEmojiSas(null);
                setGeneratedAt(0);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 bg-white rounded-lg border">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Scan with SmartID2 App</h2>
        <p className="text-sm text-gray-500 mb-3">
          Open the SmartID2 app on your phone and scan the QR code below.
        </p>
        <div className="flex flex-col items-center mb-3">
          <canvas
            ref={canvasRef}
            className="bg-white border border-gray-200 rounded-lg"
            style={{ width: 232, height: 232 }}
          />
          {sasCode && showNumeric && (
            <p className="text-center mt-3">
              <span className="text-xs text-gray-500">Verification code</span>
              <br />
              <span className="text-2xl font-mono font-bold tracking-[0.3em] text-gray-800">
                {sasCode}
              </span>
              <br />
              <span className="text-xs text-gray-400 mt-1">Expires in {remainingSeconds}s</span>
            </p>
          )}
          {showEmoji && (
            <p className="text-xs text-gray-400 mt-3">
              Devices will display matching symbols after scanning
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {connectionState === 'reconnecting' && (
            <p className="text-xs text-amber-600 text-center">Reconnecting...</p>
          )}
          {connectionState === 'connected' && (
            <p className="text-xs text-green-600 text-center">Connected</p>
          )}
          <button
            type="button"
            className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            onClick={handleReset}
          >
            Cancel
          </button>
          <button
            type="button"
            className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            onClick={handleToggleSasMode}
          >
            {sasMode === 'emoji' ? 'Use digits instead' : 'Use emoji instead'}
          </button>
        </div>
      </div>
    );
  }

  if (pairingState === 'awaiting_sas_confirmation') {
    if (sasMode === 'numeric') {
      return (
        <div className="p-4 bg-white rounded-lg border">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Verify Connection</h2>
          <p className="text-sm text-gray-500 mb-4">
            Confirm the code on your phone matches the code below.
          </p>
          <div className="flex flex-col items-center mb-4">
            {sasCode && (
              <p className="text-center">
                <span className="text-3xl font-mono font-bold tracking-[0.4em] text-gray-800">
                  {sasCode}
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              onClick={handleConfirmMatch}
            >
              Confirm
            </button>
            <button
              type="button"
              className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
              onClick={handleRejectMatch}
            >
              Cancel
            </button>
            <button
              type="button"
              className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              onClick={handleToggleSasMode}
            >
              Use emoji instead
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 bg-white rounded-lg border">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Verify Symbols</h2>
        <p className="text-sm text-gray-500 mb-4">Do these symbols match your phone screen?</p>
        <div className="flex justify-center gap-4 mb-4">
          {emojiSas ? (
            <>
              <span className="text-[48px] leading-none">{emojiSas[0]}</span>
              <span className="text-[48px] leading-none">{emojiSas[1]}</span>
              <span className="text-[48px] leading-none">{emojiSas[2]}</span>
            </>
          ) : (
            <div className="text-sm text-gray-400">Waiting for symbols...</div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            onClick={handleConfirmMatch}
          >
            Match
          </button>
          <button
            type="button"
            className="w-full py-2.5 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors"
            onClick={handleRejectMatch}
          >
            No Match
          </button>
          <button
            type="button"
            className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            onClick={handleToggleSasMode}
          >
            Use digits instead
          </button>
        </div>
      </div>
    );
  }

  if (pairingState === 'waiting_for_handshake') {
    return (
      <div className="p-4 bg-white rounded-lg border text-center">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Connecting...</h2>
        <div className="mb-3">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
        </div>
        <p className="text-sm text-gray-500 mb-1">Waiting for your phone to connect</p>
        {sasCode && (
          <p className="text-xs text-gray-400">
            Verification code: <span className="font-mono font-bold">{sasCode}</span>
          </p>
        )}
        <div className="mt-4">
          <button
            type="button"
            className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            onClick={handleReset}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (pairingState === 'paired') {
    return (
      <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
        <h2 className="text-lg font-bold text-green-800 mb-2">Paired!</h2>
        <p className="text-sm text-green-700 mb-1">Successfully connected to your phone</p>
        {deviceName && <p className="text-xs text-green-600 font-mono">{deviceName}</p>}
        {emojiSas && (
          <div className="flex justify-center gap-2 mt-2">
            <span className="text-2xl">{emojiSas[0]}</span>
            <span className="text-2xl">{emojiSas[1]}</span>
            <span className="text-2xl">{emojiSas[2]}</span>
          </div>
        )}
      </div>
    );
  }

  if (pairingState === 'error') {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200 text-center">
        <h2 className="text-lg font-bold text-red-800 mb-2">Pairing Failed</h2>
        <p className="text-sm text-red-600 mb-3">{pairingError ?? 'An unknown error occurred'}</p>
        <button
          type="button"
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
          onClick={handleReset}
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
}
