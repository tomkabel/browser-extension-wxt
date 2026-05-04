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

export function sortedJsonStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => {
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return `${JSON.stringify(key)}:${sortedJsonStringify(val as Record<string, unknown>)}`;
    }
    if (Array.isArray(val)) {
      return `${JSON.stringify(key)}:${JSON.stringify(val.map((v) =>
        v !== null && typeof v === 'object' ? JSON.parse(sortedJsonStringify(v as Record<string, unknown>)) : v,
      ))}`;
    }
    return `${JSON.stringify(key)}:${JSON.stringify(val)}`;
  });
  return `{${parts.join(',')}}`;
}
