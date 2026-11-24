import { E1RM_MAX_REPS, estimate1rm } from './e1rm';
import { bodyweightOn, effectiveLoad, isAnalyticSet } from './load';
import type { BodyMetric, E1rmFormula, Exercise, ID, SetEntry, Weight, WeightUnit, Workout } from './types';

/** One completed, non-warm-up set with its effective load, ready for analytics. */
export interface LiftSet {
  setId: ID;
  workoutId: ID;
  /** ISO time the set was completed. */
  date: string;
  /** Effective load in the analysis unit (see `effectiveLoad`). */
  load: number;
  reps: number;
}

/**
 * Turn raw sets of ONE exercise into analytic lift sets. Skips warm-ups, incomplete sets,
 * sets of trashed workouts, and sets whose load or reps are unknown.
 * Bodyweight for bodyweight-relative lifts: nearest weigh-in on or before the date, else the workout snapshot.
 */
export function liftSets(
  sets: readonly SetEntry[],
  exercise: Pick<Exercise, 'loadModel'>,
  workouts: ReadonlyMap<ID, Pick<Workout, 'deletedAt' | 'bodyweight'>>,
  metrics: readonly BodyMetric[],
  unit: WeightUnit,
): LiftSet[] {
  const out: LiftSet[] = [];
  for (const s of sets) {
    if (s.deletedAt || !isAnalyticSet(s) || !s.reps || s.reps < 1) continue;
    const w = workouts.get(s.workoutId);
    if (!w || w.deletedAt) continue;
    const date = s.completedAt as string;
    const bw: Weight | undefined = bodyweightOn(date.slice(0, 10), metrics as BodyMetric[]) ?? w.bodyweight;
    const load = effectiveLoad(s, exercise, bw, unit);
    if (load === null || !(load > 0)) continue;
    out.push({ setId: s.id, workoutId: s.workoutId, date, load, reps: s.reps });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface E1rmPoint {
  date: string;
  workoutId: ID;
  e1rm: number;
  /** The set the estimate came from. */
  load: number;
  reps: number;
}

/** Best e1RM per workout (sets above `E1RM_MAX_REPS` are ignored), oldest first. */
export function e1rmSeries(sets: readonly LiftSet[], formula: E1rmFormula): E1rmPoint[] {
  const best = new Map<ID, E1rmPoint>();
  for (const s of sets) {
    if (s.reps > E1RM_MAX_REPS) continue;
    const e = estimate1rm(formula, s.load, s.reps);
    if (!(e > 0)) continue;
    const cur = best.get(s.workoutId);
    if (!cur || e > cur.e1rm) best.set(s.workoutId, { date: s.date, workoutId: s.workoutId, e1rm: e, load: s.load, reps: s.reps });
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type PrKind = 'rep' | 'e1rm' | 'volume';

export interface PrEvent {
  kind: PrKind;
  date: string;
  workoutId: ID;
  /** Rep count, for `rep` PRs. */
  reps?: number;
  value: number;
  previous: number;
}

/** Rep counts tracked for rep-range PRs. */
export const PR_REP_RANGE = [1, 2, 3, 4, 5, 6, 8, 10, 12] as const;

/**
 * Personal records in time order, workout by workout. A record needs an earlier value to beat,
 * so the very first value of each kind is a baseline, not a PR. Ties are not PRs.
 * - rep: heaviest load at exactly N reps (N in `PR_REP_RANGE`).
 * - e1rm: highest estimate with `formula` (reps ≤ `E1RM_MAX_REPS`).
 * - volume: total load × reps of the exercise in one workout.
 */
export function detectPrs(sets: readonly LiftSet[], formula: E1rmFormula): PrEvent[] {
  const byWorkout = new Map<ID, LiftSet[]>();
  for (const s of sets) {
    const arr = byWorkout.get(s.workoutId);
    if (arr) arr.push(s);
    else byWorkout.set(s.workoutId, [s]);
  }
  const workouts = [...byWorkout.entries()]
    .map(([id, list]) => ({ id, list, date: list.reduce((m, s) => (s.date < m ? s.date : m), list[0].date) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const bestRep = new Map<number, number>();
  let bestE1rm = 0;
  let bestVol = 0;
  const events: PrEvent[] = [];

  for (const w of workouts) {
    // Rep-range PRs.
    for (const r of PR_REP_RANGE) {
      const loads = w.list.filter((s) => s.reps === r).map((s) => s.load);
      if (!loads.length) continue;
      const top = Math.max(...loads);
      const prev = bestRep.get(r);
      if (prev !== undefined && top > prev) events.push({ kind: 'rep', date: w.date, workoutId: w.id, reps: r, value: top, previous: prev });
      if (prev === undefined || top > prev) bestRep.set(r, top);
    }
    // e1RM PR.
    const point = e1rmSeries(w.list, formula)[0];
    if (point) {
      if (bestE1rm > 0 && point.e1rm > bestE1rm) events.push({ kind: 'e1rm', date: w.date, workoutId: w.id, value: point.e1rm, previous: bestE1rm });
      bestE1rm = Math.max(bestE1rm, point.e1rm);
    }
    // Volume PR.
    const vol = w.list.reduce((t, s) => t + s.load * s.reps, 0);
    if (bestVol > 0 && vol > bestVol) events.push({ kind: 'volume', date: w.date, workoutId: w.id, value: vol, previous: bestVol });
    bestVol = Math.max(bestVol, vol);
  }
  return events;
}
