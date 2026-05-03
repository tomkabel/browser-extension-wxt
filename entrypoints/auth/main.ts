export {};

const EXTENSION_ID = chrome.runtime.id;
const RELYING_PARTY_ID = EXTENSION_ID;
const CREDENTIAL_STORAGE_KEY = 'mfa:credential';

const statusEl = document.getElementById('status')!;
const logEl = document.getElementById('log')!;
const btnRegister = document.getElementById('btn-register') as HTMLButtonElement;
const btnAuthenticate = document.getElementById('btn-authenticate') as HTMLButtonElement;

let existingCredential: { id: string; rawId: string } | null = null;

// Rate limiting for auth page attempts
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

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function setButtonsEnabled(enabled: boolean): void {
  btnRegister.disabled = !enabled;
  btnAuthenticate.disabled = !enabled;
}

async function loadExistingCredential(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(CREDENTIAL_STORAGE_KEY);
    const stored = result[CREDENTIAL_STORAGE_KEY];
    if (stored && typeof stored.id === 'string' && typeof stored.rawId === 'string') {
      existingCredential = { id: stored.id, rawId: stored.rawId };
      status('Credential found. Ready to authenticate.');
      btnRegister.style.display = 'none';
      btnAuthenticate.style.display = 'block';
      log(`Stored credential: ${stored.id.slice(0, 32)}...`);
      return true;
    }
  } catch {
    // credential not found
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

    await chrome.storage.local.set({ [CREDENTIAL_STORAGE_KEY]: stored });

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

    const prfEnabled =
      'prf' in (credential as { prf?: unknown }) &&
      (credential as { prf?: { enabled?: boolean } }).prf?.enabled === true;

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

async function init(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

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
