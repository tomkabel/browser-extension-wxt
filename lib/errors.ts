/**
 * Centralized error handling.
 * - Consistent error formatting
 * - Error boundary support
 * - Logging utilities
 */

export class ExtensionError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

export class RateLimitError extends ExtensionError {
  constructor(retryAfterMs?: number) {
    super('Rate limited', 'RATE_LIMIT', true);
    this.retryAfterMs = retryAfterMs;
  }
  retryAfterMs?: number;
}

export class ContextInvalidatedError extends ExtensionError {
  constructor() {
    super('Context invalidated', 'CONTEXT_INVALID', false);
  }
}

export class ApiError extends ExtensionError {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    // recoverable only for 5xx server errors and 429 rate limit
    // NOT for 4xx client errors (400, 401, 403, 404 will never succeed on retry)
    super(
      message,
      'API_ERROR',
      statusCode !== undefined && (statusCode >= 500 || statusCode === 429),
    );
  }
}

export class SessionExpiredError extends ExtensionError {
  constructor() {
    super('MFA session expired', 'SESSION_EXPIRED', false);
  }
}

// Check if running in development mode
// Use Vite's import.meta.env.DEV which works in browser context
const isDev = import.meta.env.DEV;

export const log = {
  info: isDev ? console.info.bind(console, '[EXT]') : () => {},
  warn: isDev ? console.warn.bind(console, '[EXT]') : () => {},
  error: isDev ? console.error.bind(console, '[EXT]') : () => {},
  debug: isDev ? console.debug.bind(console, '[EXT]') : () => {},
};

export function handleExtensionError(error: unknown): ExtensionError | null {
  if (error instanceof ExtensionError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.message.includes('Extension context')) {
      return new ContextInvalidatedError();
    }
    return new ExtensionError(error.message, 'UNKNOWN', true);
  }

  return null;
}
