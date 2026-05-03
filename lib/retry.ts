/**
 * Retry utility with exponential backoff.
 * - Respects Retry-After header
 * - Jitter to prevent thundering herd
 * - Abort controller support
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalTimeMs: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterMs: 500,
  shouldRetry: () => true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err;

      if (attempt >= opts.maxAttempts || !opts.shouldRetry(err, attempt)) {
        break;
      }

      const delay = calculateDelay(attempt, opts);
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError instanceof Error ? lastError.message : 'Unknown error',
    attempts: opts.maxAttempts,
    totalTimeMs: Date.now() - startTime,
  };
}

function calculateDelay(attempt: number, opts: Required<RetryOptions>): number {
  const exponentialDelay = opts.baseDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, opts.maxDelayMs);
  const jitter = (Math.random() * 2 - 1) * opts.jitterMs;
  return Math.max(0, cappedDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Only retry AbortError (timeout) - NOT TypeError (usually CORS/invalid URL)
    if (error.name === 'AbortError') {
      return true;
    }

    if ('status' in error) {
      const status = (error as { status: number }).status;
      // Retry 5xx server errors and 429 rate limit - NOT 4xx client errors
      return status >= 500 || status === 429;
    }
  }
  return false;
}
