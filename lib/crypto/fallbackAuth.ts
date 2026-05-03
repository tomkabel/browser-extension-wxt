const PIN_ITERATIONS = 100_000;
const PIN_KEY_LENGTH = 256;
const PIN_HASH = 'SHA-256';
const ENCRYPTION_ALGO = 'AES-GCM';
const KEYPAIR_ALGO: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };

const STORAGE_KEY_SALT = 'fallback:salt';
const STORAGE_KEY_IV = 'fallback:iv';
const STORAGE_KEY_ENCRYPTED_PK = 'fallback:encryptedPk';
const STORAGE_KEY_PUBLIC_KEY = 'fallback:publicKey';

const PRF_CREDENTIAL_CACHE_KEY = 'prf:credentialId';
const PRF_REAUTH_DOMAIN = 'smartid2-reauth-v1';

const RELYING_PARTY_ID = 'smartid2-extension';
const RELYING_PARTY_NAME = 'SmartID2';

interface PrfCredentialResult {
  credentialId: string;
  prfEnabled: boolean;
}

interface FallbackStoredKey {
  salt: string;
  iv: string;
  encryptedPrivateKey: string;
  publicKey: string;
}

async function derivePinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);

  const keyMaterial = await crypto.subtle.importKey('raw', pinBytes, 'PBKDF2', false, [
    'deriveBits',
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PIN_ITERATIONS,
      hash: PIN_HASH,
    },
    keyMaterial,
    { name: ENCRYPTION_ALGO, length: PIN_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateAndStoreKeypair(pin: string): Promise<CryptoKeyPair> {
  const keypair = await crypto.subtle.generateKey(KEYPAIR_ALGO, true, ['sign', 'verify']);

  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keypair.privateKey);
  const spki = await crypto.subtle.exportKey('spki', keypair.publicKey);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const pinKey = await derivePinKey(pin, salt);

  const encryptedPrivateKey = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGO, iv: iv.buffer as ArrayBuffer },
    pinKey,
    pkcs8,
  );

  const stored: FallbackStoredKey = {
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    encryptedPrivateKey: bufferToBase64(encryptedPrivateKey),
    publicKey: bufferToBase64(spki),
  };

  await chrome.storage.local.set({
    [STORAGE_KEY_SALT]: stored.salt,
    [STORAGE_KEY_IV]: stored.iv,
    [STORAGE_KEY_ENCRYPTED_PK]: stored.encryptedPrivateKey,
    [STORAGE_KEY_PUBLIC_KEY]: stored.publicKey,
  });

  return keypair;
}

export async function unlockKeypair(pin: string): Promise<CryptoKeyPair> {
  const result = await chrome.storage.local.get([
    STORAGE_KEY_SALT,
    STORAGE_KEY_IV,
    STORAGE_KEY_ENCRYPTED_PK,
    STORAGE_KEY_PUBLIC_KEY,
  ]);

  const salt = result[STORAGE_KEY_SALT] as string | undefined;
  const iv = result[STORAGE_KEY_IV] as string | undefined;
  const encryptedPk = result[STORAGE_KEY_ENCRYPTED_PK] as string | undefined;
  const publicKeyB64 = result[STORAGE_KEY_PUBLIC_KEY] as string | undefined;

  if (!salt || !iv || !encryptedPk || !publicKeyB64) {
    throw new Error('No stored keypair found');
  }

  const pinKey = await derivePinKey(pin, new Uint8Array(base64ToBuffer(salt)));

  let decryptedPkcs8: ArrayBuffer;
  try {
    decryptedPkcs8 = await crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGO, iv: new Uint8Array(base64ToBuffer(iv)) },
      pinKey,
      base64ToBuffer(encryptedPk),
    );
  } catch {
    throw new Error('Invalid PIN');
  }

  const privateKey = await crypto.subtle.importKey('pkcs8', decryptedPkcs8, KEYPAIR_ALGO, true, [
    'sign',
  ]);

  const publicKey = await crypto.subtle.importKey(
    'spki',
    base64ToBuffer(publicKeyB64),
    KEYPAIR_ALGO,
    true,
    ['verify'],
  );

  return { privateKey, publicKey };
}

export async function hasStoredKeypair(): Promise<boolean> {
  const result = await chrome.storage.local.get([STORAGE_KEY_ENCRYPTED_PK, STORAGE_KEY_PUBLIC_KEY]);
  return !!(result[STORAGE_KEY_ENCRYPTED_PK] && result[STORAGE_KEY_PUBLIC_KEY]);
}

export async function clearStoredKeypair(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEY_SALT,
    STORAGE_KEY_IV,
    STORAGE_KEY_ENCRYPTED_PK,
    STORAGE_KEY_PUBLIC_KEY,
  ]);
}

export function checkPrfSupport(): boolean {
  return (
    typeof PublicKeyCredential !== 'undefined' &&
    typeof PublicKeyCredential.isConditionalMediationAvailable === 'function'
  );
}

export async function generatePrfSalt(
  phoneStaticPublicKey: Uint8Array,
): Promise<Uint8Array> {
  const domainBytes = new TextEncoder().encode(PRF_REAUTH_DOMAIN);
  const combined = new Uint8Array(phoneStaticPublicKey.length + domainBytes.length);
  combined.set(phoneStaticPublicKey, 0);
  combined.set(domainBytes, phoneStaticPublicKey.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(hash);
}

export async function createPrfCredential(
  salt: Uint8Array,
): Promise<PrfCredentialResult> {
  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: new Uint8Array(32),
      rp: { id: RELYING_PARTY_ID, name: RELYING_PARTY_NAME },
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
      } as Record<string, unknown>,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('PRF credential creation returned null');
  }

  const prfEnabled =
    'prf' in (credential as { prf?: unknown }) &&
    (credential as { prf?: { enabled?: boolean } }).prf?.enabled === true;

  const credentialId = bufferToBase64(credential.rawId);

  return { credentialId, prfEnabled };
}

export async function assertPrfCredential(
  salt: Uint8Array,
): Promise<{ prfOutput: Uint8Array; credentialId: string }> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: new Uint8Array(32),
      rpId: RELYING_PARTY_ID,
      timeout: 60000,
      userVerification: 'required',
      extensions: {
        prf: { eval: { first: salt } },
      } as Record<string, unknown>,
    },
    mediation: 'silent' as CredentialMediationRequirement,
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('PRF credential assertion returned null');
  }

  const prfResults = (assertion as { getClientExtensionResults?: () => unknown })
    .getClientExtensionResults?.() as
    | { prf?: { results?: { first?: ArrayBuffer } } }
    | undefined;

  const prfOutputBuffer = prfResults?.prf?.results?.first;
  if (!prfOutputBuffer) {
    throw new Error('PRF assertion did not return prf results');
  }

  const credentialId = bufferToBase64(assertion.rawId);

  return { prfOutput: new Uint8Array(prfOutputBuffer), credentialId };
}

export async function cachePrfCredentialId(credentialId: string): Promise<void> {
  await chrome.storage.session.set({ [PRF_CREDENTIAL_CACHE_KEY]: credentialId });
}

export async function getCachedPrfCredentialId(): Promise<string | null> {
  const result = await chrome.storage.session.get(PRF_CREDENTIAL_CACHE_KEY);
  const id = result[PRF_CREDENTIAL_CACHE_KEY] as string | undefined;
  return id ?? null;
}

export async function clearPrfCredentialCache(): Promise<void> {
  await chrome.storage.session.remove(PRF_CREDENTIAL_CACHE_KEY);
}
