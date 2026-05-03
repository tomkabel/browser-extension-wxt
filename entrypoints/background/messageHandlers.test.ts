import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'debug').mockImplementation(() => {});

describe('Message Handlers Registration (7.1, 7.2)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
  });

  it('registerMessageHandlers does not throw', async () => {
    const { registerMessageHandlers } = await import('./messageHandlers');
    expect(() => registerMessageHandlers()).not.toThrow();
  });

  it('can be registered multiple times (idempotent)', async () => {
    const { registerMessageHandlers } = await import('./messageHandlers');
    registerMessageHandlers();
    expect(() => registerMessageHandlers()).not.toThrow();
  });
});
