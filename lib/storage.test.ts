import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('wxt/utils/storage', () => {
  const store = new Map<string, unknown>();
  return {
    storage: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    },
  };
});

const { phaseGate, getMigrationPhase, setMigrationPhase } = await import('./storage');
const { storage } = await import('wxt/utils/storage');

describe('phaseGate', () => {
  it('allows access when current phase equals required phase', () => {
    expect(
      phaseGate('phase1.5', {
        feature: 'usb',
        minimumPhase: 'phase1.5',
        description: 'test',
      }),
    ).toBe(true);
  });

  it('allows access when current phase is ahead of required', () => {
    expect(
      phaseGate('full-v6', {
        feature: 'usb',
        minimumPhase: 'phase1',
        description: 'test',
      }),
    ).toBe(true);
  });

  it('blocks access when current phase is behind required', () => {
    expect(
      phaseGate('phase1', {
        feature: 'zktls',
        minimumPhase: 'phase2b',
        description: 'test',
      }),
    ).toBe(false);
  });

  it('blocks access for phase2c when current is phase2a', () => {
    expect(
      phaseGate('phase2a', {
        feature: 'qes',
        minimumPhase: 'phase2c',
        description: 'test',
      }),
    ).toBe(false);
  });

  it('handles full-v6 as the highest phase', () => {
    expect(
      phaseGate('full-v6', {
        feature: 'anything',
        minimumPhase: 'full-v6',
        description: 'test',
      }),
    ).toBe(true);
  });
});

describe('getMigrationPhase', () => {
  beforeEach(() => {
    vi.mocked(storage.getItem).mockReset();
  });

  it('returns phase1 as default when nothing stored', async () => {
    vi.mocked(storage.getItem).mockResolvedValue(null);
    expect(await getMigrationPhase()).toBe('phase1');
  });

  it('returns stored phase', async () => {
    vi.mocked(storage.getItem).mockResolvedValue('phase2a');
    expect(await getMigrationPhase()).toBe('phase2a');
  });

  it('reads from local:migrationPhase key', async () => {
    vi.mocked(storage.getItem).mockResolvedValue(null);
    await getMigrationPhase();
    expect(storage.getItem).toHaveBeenCalledWith('local:migrationPhase');
  });
});

describe('setMigrationPhase', () => {
  beforeEach(() => {
    vi.mocked(storage.setItem).mockReset();
  });

  it('persists phase to local:migrationPhase key', async () => {
    await setMigrationPhase('phase2b');
    expect(storage.setItem).toHaveBeenCalledWith('local:migrationPhase', 'phase2b');
  });
});
