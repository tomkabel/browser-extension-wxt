export function base64urlDecode(input: string): ArrayBuffer {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = base64.length % 4;
  const padLen = remainder === 0 ? 0 : 4 - remainder;
  const padded = padLen > 0 ? base64 + '='.repeat(padLen) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

export function base64urlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    const byteVal = bytes[i] as number;
    binary += String.fromCharCode(byteVal);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sortObjectKeys<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortObjectKeys) as unknown as T;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
  }
  return sorted as T;
}

export function sortedJsonStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(sortObjectKeys(obj));
}
