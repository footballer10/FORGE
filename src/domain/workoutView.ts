import { formatSet } from './logging';
import type { ID, LoadModel, SetEntry, WeightUnit } from './types';

/**
 * Which exercise card is open by default on the logging screen: the first one that still has
 * sets to do (or no sets yet). Everything else starts collapsed to keep the screen calm.
 */
export function currentExerciseId(rows: { id: ID; sets: Pick<SetEntry, 'completedAt'>[] }[]): ID | undefined {
  return rows.find((r) => r.sets.length === 0 || r.sets.some((s) => !s.completedAt))?.id;
}

export interface SetProgress {
  doneWorking: number;
  totalWorking: number;
  warmups: number;
  warmupsDone: number;
}

export function setProgress(sets: Pick<SetEntry, 'type' | 'completedAt'>[]): SetProgress {
  const working = sets.filter((s) => s.type !== 'warmup');
  const warm = sets.filter((s) => s.type === 'warmup');
  return {
    doneWorking: working.filter((s) => s.completedAt).length,
    totalWorking: working.length,
    warmups: warm.length,
    warmupsDone: warm.filter((s) => s.completedAt).length,
  };
}

/** Heaviest completed working set (ties: more reps), for the collapsed card summary. */
export function bestWorkingSet<T extends Pick<SetEntry, 'type' | 'completedAt' | 'weight' | 'reps'>>(sets: T[]): T | undefined {
  return sets
    .filter((s) => s.type !== 'warmup' && s.completedAt)
    .reduce<T | undefined>((best, s) => {
      if (!best) return s;
      const w = s.weight ?? 0;
      const bw = best.weight ?? 0;
      return w > bw || (w === bw && (s.reps ?? 0) > (best.reps ?? 0)) ? s : best;
    }, undefined);
}

/** "3/4 sets · 225 lb × 5" for a collapsed card. */
export function collapsedSummary(sets: SetEntry[], loadModel: LoadModel, unit: WeightUnit): string {
  const p = setProgress(sets);
  if (p.totalWorking === 0 && p.warmups > 0) return `${p.warmupsDone}/${p.warmups} warm-up`;
  const best = bestWorkingSet(sets);
  const parts = [`${p.doneWorking}/${p.totalWorking} sets`];
  if (best) parts.push(formatSet(best, loadModel, best.unit ?? unit));
  return parts.join(' · ');
}

/** Warm-ups fold into one line once all are done (and the user has not opened them). */
export function foldWarmups(sets: Pick<SetEntry, 'type' | 'completedAt'>[], userOpened: boolean): boolean {
  const warm = sets.filter((s) => s.type === 'warmup');
  return warm.length > 0 && warm.every((s) => s.completedAt) && !userOpened;
}
