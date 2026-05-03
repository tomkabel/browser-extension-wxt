/**
 * API Relay with retry logic, authentication, and error handling.
 * - Runs in background (not popup) to avoid CORS
 * - Uses exponential backoff
 * - Includes authentication headers
 * - Handles service worker lifetime
 */

import { storage } from 'wxt/utils/storage';
import { withRetry, isRetryableError } from '~/lib/retry';
import { log } from '~/lib/errors';

const API_ENDPOINT = (typeof process !== 'undefined' ? process.env.VITE_API_ENDPOINT : '') || '';

const apiEndpoint = storage.defineItem<string>('local:apiEndpoint', {
  fallback: API_ENDPOINT || '',
});

const apiKey = storage.defineItem<string>('local:apiKey', {
  fallback: '',
});

const authToken = storage.defineItem<string>('session:authToken', {
  fallback: '',
});

export interface SendPayload {
  content: Record<string, unknown>;
  metadata: {
    domain: string;
    url: string;
    timestamp: number;
  };
}

export interface ApiResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

export const ApiRelay = {
  async send(
    payload: SendPayload['content'],
    metadata: SendPayload['metadata'],
  ): Promise<ApiResult> {
    const endpoint = await apiEndpoint.getValue();
    const key = await apiKey.getValue();
    const token = await authToken.getValue();

    const result = await withRetry(
      async () => {
        const response = await fetch(`${endpoint}/api/dom-content`, {
          method: 'POST',
          headers: buildHeaders(key, token),
          body: JSON.stringify({
            payload,
            metadata: {
              ...metadata,
              sentAt: new Date().toISOString(),
            },
          }),
          signal: createAbortSignal(30000),
        });

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & {
            status?: number;
          };
          error.status = response.status;
          throw error;
        }

        return response.json();
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        shouldRetry: isRetryableError,
      },
    );

    if (result.success) {
      return { success: true, data: result.data };
    }

    log.error('API send failed:', result.error, 'attempts:', result.attempts);
    return {
      success: false,
      error: result.error,
    };
  },

  async healthCheck(): Promise<ApiResult> {
    const endpoint = await apiEndpoint.getValue();
    const key = await apiKey.getValue();
    const token = await authToken.getValue();

    const result = await withRetry(
      async () => {
        const response = await fetch(`${endpoint}/health`, {
          method: 'GET',
          headers: buildHeaders(key, token),
          signal: createAbortSignal(5000),
        });

        if (!response.ok) {
          throw new Error(`Health check failed: ${response.status}`);
        }

        return { ok: true, status: response.status };
      },
      { maxAttempts: 2, baseDelayMs: 500 },
    );

    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  },
};

function buildHeaders(apiKey: string, authToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client': 'domain-inspector/1.0',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return headers;
}

function createAbortSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}
