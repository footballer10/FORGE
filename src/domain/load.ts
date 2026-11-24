import type { BodyMetric, Exercise, ISODate, SetEntry, Weight, WeightUnit } from './types';
import { convertWeight } from './units';

type LoadExercise = Pick<Exercise, 'loadModel'>;
type LoadSet = Pick<SetEntry, 'type' | 'weight' | 'unit' | 'reps' | 'completedAt'>;

/** Only completed, non-warm-up sets count toward PRs, volume and every other analytic. */
export function isAnalyticSet(set: Pick<SetEntry, 'type' | 'completedAt'>): boolean {
  return set.type !== 'warmup' && !!set.completedAt;
}

/** Whether the exercise's load can feed e1RM and volume. */
export function hasLoad(exercise: LoadExercise): boolean {
  return exercise.loadModel !== 'timeDistance' && exercise.loadModel !== 'repsOnly';
}

/**
 * The load actually moved, in `unit`, for e1RM and volume.
 * - total: logged weight.
 * - perImplement: logged weight of ONE implement (never doubled).
 * - bodyweightPlusAdded: bodyweight + logged weight (missing weight = 0).
 * - assisted: bodyweight − logged assistance, floored at 0.
 * Returns null when the load cannot be known (no load model, or bodyweight missing).
 */
export function effectiveLoad(
  set: LoadSet,
  exercise: LoadExercise,
  bodyweight: Weight | undefined,
  unit: WeightUnit,
): number | null {
  const logged = set.weight === undefined ? undefined : convertWeight(set.weight, set.unit, unit);
  switch (exercise.loadModel) {
    case 'total':
    case 'perImplement':
      return logged ?? null;
    case 'bodyweightPlusAdded': {
      if (!bodyweight) return null;
      return convertWeight(bodyweight.value, bodyweight.unit, unit) + (logged ?? 0);
    }
    case 'assisted': {
      if (!bodyweight) return null;
      return Math.max(0, convertWeight(bodyweight.value, bodyweight.unit, unit) - (logged ?? 0));
    }
    case 'timeDistance':
    case 'repsOnly':
      return null;
  }
}

/** Load × reps for an analytic set, else 0. */
export function setVolume(
  set: LoadSet,
  exercise: LoadExercise,
  bodyweight: Weight | undefined,
  unit: WeightUnit,
): number {
  if (!isAnalyticSet(set) || !set.reps) return 0;
  const load = effectiveLoad(set, exercise, bodyweight, unit);
  return load === null ? 0 : load * set.reps;
}

/**
 * Weight shown in the UI. Storage for perImplement is always one implement;
 * with `showPairTotal` the display doubles it. Never use this for analytics.
 */
export function displayWeight(
  set: Pick<SetEntry, 'weight' | 'unit'>,
  exercise: LoadExercise,
  showPairTotal: boolean,
  unit: WeightUnit,
): number | undefined {
  if (set.weight === undefined) return undefined;
  const w = convertWeight(set.weight, set.unit, unit);
  return exercise.loadModel === 'perImplement' && showPairTotal ? w * 2 : w;
}

/**
 * Most recent bodyweight on or before `date`. Falls back to the earliest later
 * weigh-in if none precedes it, so early history still gets a reasonable value.
 */
export function bodyweightOn(date: ISODate, metrics: BodyMetric[]): Weight | undefined {
  const bw = metrics
    .filter((m) => m.kind === 'bodyweight' && !m.deletedAt && (m.unit === 'lb' || m.unit === 'kg'))
    .sort((a, b) => a.date.localeCompare(b.date));
  let found: BodyMetric | undefined;
  for (const m of bw) {
    if (m.date <= date) found = m;
    else break;
  }
  found ??= bw[0];
  return found ? { value: found.value, unit: found.unit as WeightUnit } : undefined;
}
