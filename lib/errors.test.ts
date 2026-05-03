import { describe, it, expect } from 'vitest';
import {
  ExtensionError,
  RateLimitError,
  ContextInvalidatedError,
  ApiError,
  handleExtensionError,
} from './errors';

describe('Error Classes (7.6)', () => {
  it('ExtensionError has code and recoverable', () => {
    const err = new ExtensionError('test', 'TEST_CODE', true);
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.recoverable).toBe(true);
    expect(err.name).toBe('ExtensionError');
  });

  it('RateLimitError sets retryAfterMs', () => {
    const err = new RateLimitError(30000);
    expect(err.retryAfterMs).toBe(30000);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.recoverable).toBe(true);
  });

  it('RateLimitError defaults retryAfterMs to undefined', () => {
    const err = new RateLimitError();
    expect(err.retryAfterMs).toBe(undefined);
  });

  it('ContextInvalidatedError is not recoverable', () => {
    const err = new ContextInvalidatedError();
    expect(err.code).toBe('CONTEXT_INVALID');
    expect(err.recoverable).toBe(false);
  });

  describe('ApiError recoverability (7.6)', () => {
    it('4xx errors are NOT recoverable', () => {
      const err400 = new ApiError('Bad request', 400);
      expect(err400.recoverable).toBe(false);

      const err401 = new ApiError('Unauthorized', 401);
      expect(err401.recoverable).toBe(false);

      const err403 = new ApiError('Forbidden', 403);
      expect(err403.recoverable).toBe(false);

      const err404 = new ApiError('Not found', 404);
      expect(err404.recoverable).toBe(false);
    });

    it('5xx errors ARE recoverable', () => {
      const err500 = new ApiError('Server error', 500);
      expect(err500.recoverable).toBe(true);

      const err502 = new ApiError('Bad gateway', 502);
      expect(err502.recoverable).toBe(true);

      const err503 = new ApiError('Service unavailable', 503);
      expect(err503.recoverable).toBe(true);
    });

    it('429 rate limit IS recoverable', () => {
      const err = new ApiError('Too many requests', 429);
      expect(err.recoverable).toBe(true);
    });

    it('handles undefined status code', () => {
      const err = new ApiError('Unknown error');
      expect(err.recoverable).toBe(false);
      expect(err.statusCode).toBeUndefined();
    });
  });

  describe('handleExtensionError', () => {
    it('passes through ExtensionError instances', () => {
      const original = new RateLimitError(30000);
      const result = handleExtensionError(original);
      expect(result).toBe(original);
    });

    it('converts context invalidated message', () => {
      const result = handleExtensionError(new Error('Extension context invalidated.'));
      expect(result).toBeInstanceOf(ContextInvalidatedError);
    });

    it('returns null for non-errors', () => {
      expect(handleExtensionError('string')).toBeNull();
      expect(handleExtensionError(42)).toBeNull();
      expect(handleExtensionError(null)).toBeNull();
    });
  });
});
