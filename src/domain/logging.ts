import type { LoadModel, SetEntry, SetType, WeightUnit } from './types';

export type SetField = 'weight' | 'reps' | 'durationSec' | 'distanceM';

/** Which inputs a set row shows for an exercise's load model. */
export function fieldsFor(loadModel: LoadModel): SetField[] {
  switch (loadModel) {
    case 'timeDistance':
      return ['durationSec', 'distanceM'];
    case 'repsOnly':
      return ['reps'];
    default:
      return ['weight', 'reps'];
  }
}

export const SET_TYPES: { type: SetType; label: string; short: string }[] = [
  { type: 'working', label: 'Working', short: '' },
  { type: 'warmup', label: 'Warm-up', short: 'W' },
  { type: 'drop', label: 'Drop set', short: 'D' },
  { type: 'failure', label: 'To failure', short: 'F' },
  { type: 'amrap', label: 'AMRAP', short: 'A' },
];

type DraftSource = Pick<SetEntry, 'type' | 'weight' | 'reps' | 'durationSec' | 'distanceM'>;
export type SetDraft = Partial<DraftSource> & { type: SetType };

/** Sets for a newly added exercise: the structure of the last session, else one empty working set. */
export function prefillDrafts(last: DraftSource[]): SetDraft[] {
  if (last.length === 0) return [{ type: 'working' }];
  return last.map((s) => ({
    type: s.type,
    ...(s.weight !== undefined ? { weight: s.weight } : {}),
    ...(s.reps !== undefined ? { reps: s.reps } : {}),
    ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
    ...(s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
  }));
}

/** A set can be ticked off once its defining value exists (reps, or duration/distance). */
export function canComplete(set: Pick<SetEntry, 'reps' | 'durationSec' | 'distanceM'>, loadModel: LoadModel): boolean {
  if (loadModel === 'timeDistance') return set.durationSec !== undefined || set.distanceM !== undefined;
  return set.reps !== undefined && set.reps > 0;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const num = (n: number) => String(Math.round(n * 100) / 100);

/** Compact text for a set: "135 × 5", "× 8", "1:30 · 400 m". */
export function formatSet(set: DraftSource, loadModel: LoadModel, unit: WeightUnit): string {
  switch (fieldsFor(loadModel).join()) {
    case 'durationSec,distanceM': {
      const parts = [set.durationSec !== undefined ? formatDuration(set.durationSec) : '', set.distanceM !== undefined ? `${num(set.distanceM)} m` : ''];
      return parts.filter(Boolean).join(' · ') || '—';
    }
    case 'reps':
      return `× ${set.reps ?? '—'}`;
    default:
      return `${set.weight !== undefined ? `${num(set.weight)} ${unit}` : '—'} × ${set.reps ?? '—'}`;
  }
}

/** Workout length in whole minutes. */
export function durationMinutes(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000));
}

/** The set a "Suggested" chip fills: the first working set (not a warm-up) that is not done yet. */
export function suggestionTarget<T extends Pick<SetEntry, 'type' | 'completedAt'>>(sets: readonly T[]): T | undefined {
  return sets.find((s) => s.type !== 'warmup' && !s.completedAt);
}
