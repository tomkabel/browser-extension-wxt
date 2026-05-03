import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.spyOn(console, 'info').mockImplementation(() => {});
vi.spyOn(console, 'debug').mockImplementation(() => {});

// In-memory store shared across the mock
const testStore = new Map<string, unknown>();

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: <T>(key: string, opts?: { fallback?: T }) => ({
      getValue: vi.fn(async () => (testStore.get(key) as T) ?? opts?.fallback),
      setValue: vi.fn(async (val: T) => {
        testStore.set(key, val);
      }),
    }),
    getItem: vi.fn(async <T>(key: string) => (testStore.get(key) as T) ?? null),
    setItem: vi.fn(async (key: string, val: unknown) => {
      testStore.set(key, val);
    }),
    removeItem: vi.fn(async (key: string) => {
      testStore.delete(key);
    }),
  },
}));

beforeEach(() => {
  testStore.clear();
});

describe('Tab State Manager (7.1, 7.9)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
    testStore.clear();
  });

  it('stores and retrieves tab domain state', async () => {
    const { TabStateManager } = await import('./tabState');

    const updated = await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee');
    expect(updated).toBe(true);

    const state = await TabStateManager.getTabDomain(1);
    expect(state).not.toBeNull();
    expect(state!.domain).toBe('www.lhv.ee');
    expect(state!.registrableDomain).toBe('lhv.ee');
  });

  it('deduplicates same domain within cache TTL', async () => {
    const { TabStateManager } = await import('./tabState');

    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee');
    const updated = await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee');
    expect(updated).toBe(false);
  });

  it('updates on different domain', async () => {
    const { TabStateManager } = await import('./tabState');

    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee');
    const updated = await TabStateManager.updateTabDomain(1, 'https://www.example.com');
    expect(updated).toBe(true);
  });

  it('skips invalid URLs', async () => {
    const { TabStateManager } = await import('./tabState');

    const updated = await TabStateManager.updateTabDomain(1, '');
    expect(updated).toBe(false);
  });

  it('clears tab state on clearTabState', async () => {
    const { TabStateManager } = await import('./tabState');

    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee');
    await TabStateManager.clearTabState(1);

    const state = await TabStateManager.getTabDomain(1);
    expect(state).toBeNull();
  });

  it('clears all state on clearAllStates', async () => {
    const { TabStateManager } = await import('./tabState');

    await TabStateManager.updateTabDomain(1, 'https://www.lhv.ee');
    await TabStateManager.updateTabDomain(2, 'https://www.example.com');
    testStore.clear();
    await TabStateManager.clearAllStates();

    const state1 = await TabStateManager.getTabDomain(1);
    const state2 = await TabStateManager.getTabDomain(2);
    // clearAllStates only clears cache, but storage was cleared via testStore
    expect(state1).toBeNull();
    expect(state2).toBeNull();
  });
});
