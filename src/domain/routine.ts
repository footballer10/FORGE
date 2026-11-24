import type { RoutineExercise, SetEntry, SetType, TargetSet, WeightUnit } from './types';
import type { SetDraft } from './logging';
import type { Suggestion } from './progression';

const num = (n: number) => String(Math.round(n * 100) / 100);

/** A fresh target: one working set, 8 reps. */
export const defaultTarget = (): TargetSet => ({ type: 'working', reps: 8 });

/**
 * Sets to create when a routine exercise is started. Reps come from the target (low end of a range);
 * weight is the target's own weight, else the same-numbered set of the last session; when the target
 * has no weight and there is no history, the set starts empty. RPE is a target, not a result, so it
 * is never prefilled.
 */
export function draftsFromTargets(
  targets: readonly TargetSet[],
  last: readonly Pick<SetEntry, 'weight' | 'unit' | 'type'>[],
  fallbackUnit: WeightUnit,
): (SetDraft & { unit: WeightUnit })[] {
  const list: readonly TargetSet[] = targets.length > 0 ? targets : [defaultTarget()];
  // Match history by position among sets of the same kind (warm-up vs not) so a warm-up target
  // does not take the weight of the first working set.
  const pools: Record<'warm' | 'work', typeof last[number][]> = {
    warm: last.filter((s) => s.type === 'warmup'),
    work: last.filter((s) => s.type !== 'warmup'),
  };
  const used = { warm: 0, work: 0 };
  return list.map((t) => {
    const kind = t.type === 'warmup' ? 'warm' : 'work';
    const hist = pools[kind][used[kind]++];
    const weight = t.weight ?? hist?.weight;
    return {
      type: t.type,
      unit: t.unit ?? hist?.unit ?? fallbackUnit,
      ...(weight !== undefined ? { weight } : {}),
      ...(t.reps !== undefined ? { reps: t.reps } : {}),
      ...(t.durationSec !== undefined ? { durationSec: t.durationSec } : {}),
      ...(t.distanceM !== undefined ? { distanceM: t.distanceM } : {}),
    };
  });
}

const sameShape = (a: TargetSet, b: TargetSet) =>
  a.type === b.type && a.reps === b.reps && a.repsMax === b.repsMax && a.weight === b.weight && a.unit === b.unit &&
  a.rpe === b.rpe && a.durationSec === b.durationSec && a.distanceM === b.distanceM && a.percentE1rm === b.percentE1rm;

function describeOne(t: TargetSet): string {
  const parts: string[] = [];
  if (t.reps !== undefined) parts.push(t.repsMax !== undefined && t.repsMax > t.reps ? `${t.reps}–${t.repsMax}` : `${t.reps}`);
  if (t.durationSec !== undefined) parts.push(`${Math.floor(t.durationSec / 60)}:${String(Math.round(t.durationSec % 60)).padStart(2, '0')}`);
  if (t.distanceM !== undefined) parts.push(`${num(t.distanceM)} m`);
  let s = parts.join(' · ') || '—';
  if (t.weight !== undefined) s += ` @ ${num(t.weight)}${t.unit ?? ''}`;
  if (t.percentE1rm !== undefined) s += ` @ ${num(t.percentE1rm * 100)}% e1RM`;
  if (t.rpe !== undefined) s += ` · RPE ${num(t.rpe)}`;
  const tag: Partial<Record<SetType, string>> = { warmup: 'warm-up ', drop: 'drop ', failure: 'failure ', amrap: 'AMRAP ' };
  return `${tag[t.type] ?? ''}${s}`;
}

/** "2 × 5 · 3 × 6–8 · RPE 8": consecutive identical targets are grouped as `n × target`. */
export function describeTargets(targets: readonly TargetSet[]): string {
  if (targets.length === 0) return 'No targets';
  const groups: { t: TargetSet; n: number }[] = [];
  for (const t of targets) {
    const g = groups[groups.length - 1];
    if (g && sameShape(g.t, t)) g.n += 1;
    else groups.push({ t, n: 1 });
  }
  return groups.map(({ t, n }) => (n > 1 ? `${n} × ${describeOne(t)}` : describeOne(t))).join(' · ');
}

/** Re-number `order` 0..n-1 in array order (after add/remove/move). */
export const reindex = (items: readonly RoutineExercise[]): RoutineExercise[] => items.map((e, order) => ({ ...e, order }));

/**
 * Clean a routine's exercises before saving: drop targets with no usable value, clamp ranges so
 * repsMax >= reps, keep RPE within 1–10, drop superset groups with a single member.
 */
export function sanitizeExercises(items: readonly RoutineExercise[]): RoutineExercise[] {
  const counts = new Map<string, number>();
  for (const e of items) if (e.supersetGroup) counts.set(e.supersetGroup, (counts.get(e.supersetGroup) ?? 0) + 1);
  return reindex(items).map((e) => {
    const targets = e.targets.map((t): TargetSet => {
      const { repsMax, rpe, ...rest } = t;
      const out: TargetSet = { ...rest };
      if (repsMax !== undefined && t.reps !== undefined && repsMax > t.reps) out.repsMax = repsMax;
      if (rpe !== undefined && rpe >= 1 && rpe <= 10) out.rpe = rpe;
      return out;
    });
    const { supersetGroup, restSec, ...rest } = e;
    return {
      ...rest,
      targets,
      ...(supersetGroup && (counts.get(supersetGroup) ?? 0) > 1 ? { supersetGroup } : {}),
      ...(restSec !== undefined && restSec >= 0 ? { restSec: Math.round(restSec) } : {}),
    };
  });
}

/** Routine structure captured from a finished workout (completed, non-warm-up and warm-up sets). */
export function targetsFromSets(sets: readonly Pick<SetEntry, 'type' | 'weight' | 'unit' | 'reps' | 'durationSec' | 'distanceM' | 'completedAt' | 'rpe'>[]): TargetSet[] {
  return sets
    .filter((s) => s.completedAt)
    .map((s) => ({
      type: s.type,
      ...(s.reps !== undefined ? { reps: s.reps } : {}),
      ...(s.weight !== undefined ? { weight: s.weight, unit: s.unit } : {}),
      ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
      ...(s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
    }));
}

/**
 * Apply a progression suggestion to the drafts built from `targets`: every non-warm-up set whose
 * target has no fixed weight takes the suggested weight; a suggested rep target (double
 * progression) replaces the reps of those sets. Drafts and targets line up by index.
 */
export function applySuggestion<D extends SetDraft & { unit: WeightUnit }>(drafts: D[], targets: readonly TargetSet[], s: Suggestion): D[] {
  return drafts.map((d, i) => {
    const t = targets[i];
    if (d.type === 'warmup') return d;
    const out: D = { ...d };
    if (t?.weight === undefined) {
      out.weight = s.weight;
      out.unit = s.unit;
    }
    if (s.reps !== undefined) out.reps = s.reps;
    return out;
  });
}
