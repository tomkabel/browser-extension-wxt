/**
 * Storage layer with migration phase utilities.
 * Re-exports WXT storage and adds phase-gating logic.
 */

import { storage } from 'wxt/utils/storage';
import type { MigrationPhase, PhaseGate } from '~/types';
import { PHASE_ORDER } from '~/types';

export { storage };

const MIGRATION_PHASE_KEY = 'migrationPhase';

export async function getMigrationPhase(): Promise<MigrationPhase> {
  const stored = await storage.getItem<MigrationPhase>(`local:${MIGRATION_PHASE_KEY}`);
  return stored ?? 'phase1';
}

export async function setMigrationPhase(phase: MigrationPhase): Promise<void> {
  await storage.setItem(`local:${MIGRATION_PHASE_KEY}`, phase);
}

export function phaseGate(currentPhase: MigrationPhase, gate: PhaseGate): boolean {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const requiredIdx = PHASE_ORDER.indexOf(gate.minimumPhase);
  return currentIdx >= requiredIdx;
}
