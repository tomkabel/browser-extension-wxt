import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Create a minimal mock for wxt/utils/storage
vi.mock('wxt/utils/storage', () => {
  const store = new Map<string, unknown>();
  return {
    storage: {
      defineItem: <T>(key: string, opts?: { fallback?: T }) => ({
        getValue: vi.fn(async () => {
          const val = store.get(key) as T | undefined;
          return val ?? opts?.fallback;
        }),
        setValue: vi.fn(async (val: T) => {
          store.set(key, val);
        }),
      }),
      getItem: vi.fn(async <T>(key: string) => (store.get(key) as T) ?? null),
      setItem: vi.fn(async (key: string, val: unknown) => {
        store.set(key, val);
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

describe('API Relay (7.5)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
  });

  it('send returns success on 200 response', async () => {
    process.env.VITE_API_ENDPOINT = 'https://youtube.tomabel.ee';
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'abc-123' }), { status: 200 }),
    );

    // Dynamic import to pick up env var fallback
    const { ApiRelay } = await import('./apiRelay');
    const result = await ApiRelay.send(
      { text: 'test content', headings: [] },
      { domain: 'test.com', url: 'https://test.com', timestamp: Date.now() },
    );

    expect(result.success).toBe(true);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchCall = vi.mocked(global.fetch).mock.calls[0]!;
    const [url, opts] = fetchCall as [string, RequestInit | undefined];

    expect(url).toBe('https://youtube.tomabel.ee/api/dom-content');
    expect(opts?.method).toBe('POST');
    expect(opts?.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
  });

  it('send retries on 5xx error', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'abc-123' }), { status: 200 }));

    const { ApiRelay } = await import('./apiRelay');
    const result = await ApiRelay.send(
      { text: 'test' },
      { domain: 'test.com', url: 'https://test.com', timestamp: Date.now() },
    );

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('send does NOT retry on 4xx error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }),
    );

    const { ApiRelay } = await import('./apiRelay');
    const result = await ApiRelay.send(
      { text: 'test' },
      { domain: 'test.com', url: 'https://test.com', timestamp: Date.now() },
    );

    expect(result.success).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('healthCheck returns success on 200', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const { ApiRelay } = await import('./apiRelay');
    const result = await ApiRelay.healthCheck();

    expect(result.success).toBe(true);
  });

  it('healthCheck returns failure on non-200', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Down' }), { status: 503 }),
    );

    const { ApiRelay } = await import('./apiRelay');
    const result = await ApiRelay.healthCheck();

    expect(result.success).toBe(false);
  });
});
