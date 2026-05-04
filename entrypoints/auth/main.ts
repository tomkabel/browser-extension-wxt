import { bufferToBase64, base64ToBuffer, uint8ArrayToArrayBuffer } from '~/lib/asyncUtils';
import { createAssertionRequest } from '~/lib/webauthn';

const EXTENSION_ID = chrome.runtime.id;
const RELYING_PARTY_ID = EXTENSION_ID;

const statusEl = document.getElementById('status')!;
const logEl = document.getElementById('log')!;
const btnRegister = document.getElementById('btn-register') as HTMLButtonElement;
const btnAuthenticate = document.getElementById('btn-authenticate') as HTMLButtonElement;

let existingCredential: { id: string; rawId: string } | null = null;

const AUTH_ATTEMPT_WINDOW_MS = 60_000;
const AUTH_ATTEMPT_MAX = 3;
const attemptTimestamps: number[] = [];

function isAuthRateLimited(): boolean {
  const now = Date.now();
  while (attemptTimestamps.length > 0 && now - attemptTimestamps[0]! > AUTH_ATTEMPT_WINDOW_MS) {
    attemptTimestamps.shift();
  }
  return attemptTimestamps.length >= AUTH_ATTEMPT_MAX;
}

function recordAuthAttempt(): void {
  attemptTimestamps.push(Date.now());
}

function status(msg: string): void {
  statusEl.textContent = msg;
}

function log(msg: string): void {
  if (logEl) {
    logEl.textContent += '\n' + msg;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function setButtonsEnabled(enabled: boolean): void {
  btnRegister.disabled = !enabled;
  btnAuthenticate.disabled = !enabled;
}

function getPublicKeyFromResponse(response: AuthenticatorAttestationResponse): ArrayBuffer | null {
  if (typeof response.getPublicKey !== 'function') return null;
  const pk = response.getPublicKey();
  return pk ?? null;
}

async function loadExistingCredential(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get('mfa:credential');
    const stored = result['mfa:credential'];
    if (stored && typeof stored.id === 'string' && typeof stored.rawId === 'string') {
      existingCredential = { id: stored.id, rawId: stored.rawId };
      status('Credential found. Ready to authenticate.');
      btnRegister.style.display = 'none';
      btnAuthenticate.style.display = 'block';
      log(`Stored credential: ${stored.id.slice(0, 32)}...`);
      return true;
    }
    } catch (err) {
      console.warn('[Auth] Failed to load credential from storage:', err);
    }
    existingCredential = null;
  status('No credential registered. Register a new credential to continue.');
  btnRegister.style.display = 'block';
  btnAuthenticate.style.display = 'none';
  return false;
}

async function handleRegister(): Promise<void> {
  if (isAuthRateLimited()) {
    status('Too many attempts. Please wait 60 seconds before trying again.');
    return;
  }

  setButtonsEnabled(false);
  status('Registering credential...');

  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { id: RELYING_PARTY_ID, name: 'SmartID2' },
    user: {
      id: userId,
      name: 'smartid2-user',
      displayName: 'SmartID2 User',
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'required',
    },
    timeout: 120000,
  };

  try {
    const credential = (await navigator.credentials.create({
      publicKey,
    })) as PublicKeyCredential | null;

    if (!credential) {
      status('Registration cancelled or failed.');
      setButtonsEnabled(true);
      return;
    }

    const stored = {
      id: credential.id,
      rawId: bufferToBase64(credential.rawId),
    };

    await chrome.storage.local.set({ 'mfa:credential': stored });

    existingCredential = { id: stored.id, rawId: stored.rawId };
    status('Credential registered successfully. You can now authenticate.');
    btnRegister.style.display = 'none';
    btnAuthenticate.style.display = 'block';
    log(`Credential created: ${credential.id.slice(0, 32)}...`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status(`Registration failed: ${message}`);
    log(`ERROR: ${message}`);
    recordAuthAttempt();
    setButtonsEnabled(true);
  }
}

async function handleAuthenticate(): Promise<void> {
  if (isAuthRateLimited()) {
    status('Too many attempts. Please wait 60 seconds before trying again.');
    return;
  }

  setButtonsEnabled(false);
  status('Authenticating...');

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: RELYING_PARTY_ID,
    userVerification: 'required',
    timeout: 120000,
  };

  if (existingCredential) {
    publicKey.allowCredentials = [
      {
        id: base64ToBuffer(existingCredential.rawId),
        type: 'public-key',
      },
    ];
  }

  try {
    const assertion = (await navigator.credentials.get({
      publicKey,
    })) as PublicKeyCredential | null;

    if (!assertion) {
      status('Authentication cancelled.');
      setButtonsEnabled(true);
      return;
    }

    status('Authentication successful. Activating session...');

    const response = assertion.response as AuthenticatorAssertionResponse;

    const relayResult = await chrome.runtime.sendMessage({
      type: 'mfa-assertion',
      payload: {
        credentialId: assertion.id,
        authenticatorData: bufferToBase64(response.authenticatorData),
        clientDataJSON: bufferToBase64(response.clientDataJSON),
        signature: bufferToBase64(response.signature),
        userHandle: response.userHandle ? bufferToBase64(response.userHandle) : null,
      },
    });

    if (relayResult?.success) {
      log('Session activated.');
      window.close();
    } else {
      status(`Session activation failed: ${relayResult?.error ?? 'Unknown error'}`);
      log(`ERROR: ${relayResult?.error ?? 'Unknown error'}`);
      setButtonsEnabled(true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status(`Authentication failed: ${message}`);
    log(`ERROR: ${message}`);
    recordAuthAttempt();
    setButtonsEnabled(true);
  }
}

async function handlePrfCreate(saltBase64: string): Promise<void> {
  status('Setting up fingerprint unlock...');

  try {
    const saltBytes = base64ToBuffer(saltBase64);
    const salt = new Uint8Array(saltBytes);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: new Uint8Array(32),
        rp: { id: 'smartid2-extension', name: 'SmartID2' },
        user: {
          id: userId,
          name: 'smartid2-prf-user',
          displayName: 'SmartID2 PRF User',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
        },
        timeout: 60000,
        extensions: {
          prf: { eval: { first: salt } },
        },
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('Credential creation cancelled');
    }

    const extResults = (credential.getClientExtensionResults?.() ?? {}) as { prf?: { enabled?: boolean } };
    const prfEnabled = extResults.prf?.enabled === true;

    const relayResult = await chrome.runtime.sendMessage({
      type: 'prf-credential-created',
      payload: {
        credentialId: bufferToBase64(credential.rawId),
        prfEnabled,
        prfSalt: Array.from(salt),
      },
    });

    if (relayResult?.success) {
      log('PRF credential created and cached.');
    } else {
      log(`PRF credential relay failed: ${relayResult?.error ?? 'Unknown error'}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status('Fingerprint setup skipped');
    log(`PRF credential creation failed: ${message}`);
  }

  window.close();
}

btnRegister.addEventListener('click', handleRegister);
btnAuthenticate.addEventListener('click', handleAuthenticate);

async function handlePasskeyCreate(): Promise<void> {
  status('Creating passkey for SmartID Vault...');
  log('Passkey creation mode...');

  try {
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const prfSalt = new Uint8Array(32);
    crypto.getRandomValues(prfSalt);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { id: RELYING_PARTY_ID, name: 'SmartID Vault' },
        user: {
          id: userId,
          name: 'smartid2-vault-user',
          displayName: 'SmartID Vault',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
        },
        timeout: 60000,
        extensions: {
          prf: { eval: { first: prfSalt } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      status('Passkey creation cancelled');
      log('Passkey creation returned null');
      await reportPasskeyError('Passkey creation cancelled');
      window.close();
      return;
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const rawKey = getPublicKeyFromResponse(response);
    const publicKeyBytes = rawKey ? Array.from(new Uint8Array(rawKey)) : [];

    if (publicKeyBytes.length === 0) {
      status('Passkey creation failed: missing attestation public key');
      log('ERROR: Attestation response has no public key');
      await reportPasskeyError('Missing attestation public key');
      window.close();
      return;
    }

    const extResults = (credential.getClientExtensionResults?.() ?? {}) as { prf?: { enabled?: boolean } };
    const prfEnabled = extResults.prf?.enabled === true;

    const relayResult = await chrome.runtime.sendMessage({
      type: 'passkey-credential-created',
      payload: {
        credentialId: bufferToBase64(credential.rawId),
        publicKeyBytes,
        prfEnabled,
        prfSalt: Array.from(prfSalt),
      },
    });

    if (relayResult?.success) {
      status('Passkey created and verified. Vault is paired.');
      log('Passkey credential provisioned successfully.');
    } else {
      status('Passkey created but relay failed.');
      log(`ERROR: ${relayResult?.error ?? 'Relay failed'}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status('Passkey creation failed');
    log(`ERROR: ${message}`);
    await reportPasskeyError(message);
  }

  window.close();
}

async function reportPasskeyError(error: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'passkey-credential-error',
      payload: { error },
    });
  } catch {
    // background worker may have shut down, nothing to do
  }
}

async function handleChallengeAssert(): Promise<void> {
  status('Preparing challenge-bound assertion...');
  log('Challenge assertion mode...');

  try {
    const params = new URLSearchParams(window.location.search);
    const challengeB64 = params.get('challenge');
    if (!challengeB64) {
      status('No challenge provided');
      log('ERROR: Missing challenge parameter');
      window.close();
      return;
    }

    const challengeBytes = new Uint8Array(base64ToBuffer(challengeB64));

    const stored = await chrome.storage.session.get('pending:assertion');
    const pending = stored['pending:assertion'] as {
      derivedChallenge: number[];
      tlvComponents: number[];
      sessionNonce: number[];
      origin: string;
      controlCode: string;
      rpId: string;
    } | undefined;

    if (!pending) {
      status('No pending assertion found');
      log('ERROR: No pending assertion context in session storage');
      window.close();
      return;
    }

    status('Reading cached passkey...');
    const cachedResult = await chrome.runtime.sendMessage({ type: 'get-cached-credential-id', payload: {} }) as
      { success: boolean; data?: { credentialId?: string; rawId?: number[] } };

    const rawId = cachedResult?.data?.rawId;
    const allowCredentialId = rawId && rawId.length > 0 ? new Uint8Array(rawId) : undefined;

    status('Waiting for biometric verification...');
    log('Prompting for fingerprint/Face ID...');

    const assertionResult = await createAssertionRequest({
      challenge: challengeBytes,
      rpId: pending.rpId,
      allowCredentialId,
    });

    if (!assertionResult.success) {
      status(assertionResult.error);
      log(`Assertion failed: ${assertionResult.error}`);

      await chrome.runtime.sendMessage({
        type: 'assertion-complete',
        payload: {
          status: assertionResult.timedOut ? 'timeout' : 'cancelled',
          error: assertionResult.error,
        },
      });

      window.close();
      return;
    }

    const assertionData = assertionResult.data;

    status('Assertion captured. Sending to vault...');
    log('Assertion data captured, transmitting to background...');

    const relayResult = await chrome.runtime.sendMessage({
      type: 'assertion-complete',
      payload: {
        status: 'verified',
        credentialId: assertionData.credentialId,
        tlvComponents: pending.tlvComponents,
        sessionNonce: pending.sessionNonce,
        origin: pending.origin,
        controlCode: pending.controlCode,
        authenticatorData: Array.from(assertionData.authenticatorData),
        signature: Array.from(assertionData.signature),
        clientDataJSON: Array.from(assertionData.clientDataJSON),
        rawId: Array.from(assertionData.rawId),
      },
    });

    if (relayResult?.success) {
      status('Transaction verified via Challenge-Bound WebAuthn');
      log('Assertion transmitted to Android Vault successfully');
    } else {
      status('Verification relay failed');
      log(`ERROR: ${relayResult?.error ?? 'Relay failed'}`);

      await chrome.runtime.sendMessage({
        type: 'assertion-complete',
        payload: { status: 'error', error: relayResult?.error ?? 'Transmission failed' },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status(`Assertion failed: ${message}`);
    log(`ERROR: ${message}`);

    await chrome.runtime.sendMessage({
      type: 'assertion-complete',
      payload: { status: 'error', error: message },
    }).catch(() => {});
  }

  window.close();
}

async function init(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

  if (mode === 'challenge-assert') {
    await handleChallengeAssert();
    return;
  }

  if (mode === 'passkey-create') {
    await handlePasskeyCreate();
    return;
  }

  if (mode === 'prf-create') {
    const saltB64 = params.get('salt');
    if (saltB64) {
      log('PRF credential creation mode...');
      await handlePrfCreate(saltB64);
      return;
    }
    log('PRF mode but no salt provided, closing.');
    window.close();
    return;
  }

  status('Checking credentials...');
  log(`Extension ID: ${EXTENSION_ID}`);
  log(`WebAuthn available: ${typeof navigator.credentials !== 'undefined'}`);

  await loadExistingCredential();

  if (mode === 'register') {
    log('Auto-triggering registration...');
    await handleRegister();
  } else if (mode === 'auth') {
    if (existingCredential) {
      log('Auto-triggering authentication...');
      await handleAuthenticate();
    } else {
      status('No credential found. Please register first.');
    }
  }
}

init();