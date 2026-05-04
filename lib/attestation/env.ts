export function isDemoMode(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'demo';
}
