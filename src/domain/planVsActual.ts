import { convertWeight } from './units';
import type { ID, RoutineExercise, SetEntry, TargetSet } from './types';

export type RepsStatus = 'hit' | 'below' | 'above' | 'missed';
export type WeightStatus = 'none' | 'match' | 'lighter' | 'heavier';

export interface SetComparison {
  target: TargetSet;
  actual?: Pick<SetEntry, 'weight' | 'unit' | 'reps' | 'durationSec' | 'distanceM' | 'rpe'>;
  repsStatus: RepsStatus;
  weightStatus: WeightStatus;
}

export interface ExerciseComparison {
  exerciseId: ID;
  plannedSets: number;
  doneSets: number;
  /** Completed sets beyond the plan. */
  extra: Pick<SetEntry, 'weight' | 'unit' | 'reps' | 'type'>[];
  sets: SetComparison[];
  /** True when the exercise was not in the plan at all. */
  unplanned: boolean;
}

export interface SessionComparison {
  exercises: ExerciseComparison[];
  plannedSets: number;
  /** Planned sets that have a completed counterpart. */
  doneSets: number;
  /** doneSets / plannedSets, 0 when nothing was planned. */
  adherence: number;
}

type Done = Pick<SetEntry, 'type' | 'weight' | 'unit' | 'reps' | 'durationSec' | 'distanceM' | 'rpe' | 'completedAt'>;

/** Reps compared with the target range [reps, repsMax ?? reps]. Time-only targets count as hit when done. */
export function repsStatus(target: TargetSet, actual?: Pick<SetEntry, 'reps' | 'durationSec' | 'distanceM'>): RepsStatus {
  if (!actual) return 'missed';
  if (target.reps === undefined) return 'hit';
  const reps = actual.reps ?? 0;
  const max = target.repsMax ?? target.reps;
  if (reps < target.reps) return 'below';
  if (reps > max) return 'above';
  return 'hit';
}

/** Weight compared in the target's unit (actual converted). 'none' when the target has no weight. */
export function weightStatus(target: TargetSet, actual?: Pick<SetEntry, 'weight' | 'unit'>): WeightStatus {
  if (target.weight === undefined || !actual || actual.weight === undefined) return 'none';
  const a = convertWeight(actual.weight, actual.unit, target.unit ?? actual.unit);
  const diff = a - target.weight;
  if (Math.abs(diff) < 0.01 * Math.max(1, target.weight)) return 'match';
  return diff < 0 ? 'lighter' : 'heavier';
}

/**
 * Plan vs result for one session. Sets are matched by position within the same exercise, warm-ups
 * and working sets matched separately (as when a workout is started from a plan). Only completed
 * sets count. An exercise performed more than once in the workout is merged in order.
 */
export function compareSession(
  planned: readonly RoutineExercise[],
  actual: readonly { exerciseId: ID; sets: readonly Done[] }[],
): SessionComparison {
  const doneBy = new Map<ID, Done[]>();
  for (const a of actual) {
    const list = doneBy.get(a.exerciseId) ?? [];
    list.push(...a.sets.filter((s) => s.completedAt));
    doneBy.set(a.exerciseId, list);
  }
  const exercises: ExerciseComparison[] = [];
  const seen = new Set<ID>();
  for (const p of [...planned].sort((x, y) => x.order - y.order)) {
    if (seen.has(p.exerciseId)) continue; // a repeated exercise in the plan shares one pool; first entry wins
    seen.add(p.exerciseId);
    const done = doneBy.get(p.exerciseId) ?? [];
    const pools = { warm: done.filter((s) => s.type === 'warmup'), work: done.filter((s) => s.type !== 'warmup') };
    const used = { warm: 0, work: 0 };
    const sets = p.targets.map((target): SetComparison => {
      const kind = target.type === 'warmup' ? 'warm' : 'work';
      const a = pools[kind][used[kind]++];
      return { target, ...(a ? { actual: a } : {}), repsStatus: repsStatus(target, a), weightStatus: weightStatus(target, a) };
    });
    const extra = [...pools.warm.slice(used.warm), ...pools.work.slice(used.work)];
    exercises.push({ exerciseId: p.exerciseId, plannedSets: p.targets.length, doneSets: sets.filter((s) => s.actual).length, extra, sets, unplanned: false });
  }
  for (const [exerciseId, done] of doneBy) {
    if (!seen.has(exerciseId) && done.length > 0) exercises.push({ exerciseId, plannedSets: 0, doneSets: 0, extra: done, sets: [], unplanned: true });
  }
  const plannedSets = exercises.reduce((n, e) => n + e.plannedSets, 0);
  const doneSets = exercises.reduce((n, e) => n + e.doneSets, 0);
  return { exercises, plannedSets, doneSets, adherence: plannedSets === 0 ? 0 : doneSets / plannedSets };
}
