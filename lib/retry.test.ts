import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryableError } from './retry';

describe('withRetry (7.6, 7.7)', () => {
  it('returns success on first attempt', async () => {
    const result = await withRetry(async () => 'ok');
    expect(result.success).toBe(true);
    expect(result.data).toBe('ok');
    expect(result.attempts).toBe(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('temporary');
        return 'ok';
      },
      { maxAttempts: 3, baseDelayMs: 10 },
    );

    expect(result.success).toBe(true);
    expect(result.data).toBe('ok');
    expect(result.attempts).toBe(3);
  });

  it('gives up after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses custom shouldRetry to stop retrying', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      shouldRetry: () => false,
    });

    expect(result.success).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('tracks total time', async () => {
    const result = await withRetry(async () => 'fast');
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('isRetryableError (7.6)', () => {
  it('AbortError is retryable', () => {
    const err = new Error('timeout');
    err.name = 'AbortError';
    expect(isRetryableError(err)).toBe(true);
  });

  it('TypeError is NOT retryable (CORS/invalid URL)', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('5xx errors are retryable', () => {
    const err = new Error('Server error') as Error & { status: number };
    err.status = 500;
    expect(isRetryableError(err)).toBe(true);

    err.status = 502;
    expect(isRetryableError(err)).toBe(true);

    err.status = 503;
    expect(isRetryableError(err)).toBe(true);
  });

  it('429 rate limit is retryable', () => {
    const err = new Error('Rate limited') as Error & { status: number };
    err.status = 429;
    expect(isRetryableError(err)).toBe(true);
  });

  it('4xx errors (except 429) are NOT retryable', () => {
    const err = new Error('Bad request') as Error & { status: number };
    err.status = 400;
    expect(isRetryableError(err)).toBe(false);

    err.status = 401;
    expect(isRetryableError(err)).toBe(false);

    err.status = 403;
    expect(isRetryableError(err)).toBe(false);

    err.status = 404;
    expect(isRetryableError(err)).toBe(false);
  });

  it('generic errors without status are not retryable', () => {
    expect(isRetryableError(new Error('random'))).toBe(false);
  });
});
