import { e1rmCandidates, estimate1rm } from './e1rm';
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
  /** Estimated from a 13–20-rep set because the workout had nothing lighter on reps. */
  rough?: boolean;
}

/**
 * Best e1RM per workout, oldest first. Each workout uses its sets of 1–12 reps when it has any; a workout
 * with only 13–20-rep sets gets a rough estimate (`rough: true`). Sets above `E1RM_MAX_REPS` never count.
 */
export function e1rmSeries(sets: readonly LiftSet[], formula: E1rmFormula): E1rmPoint[] {
  const byWorkout = new Map<ID, LiftSet[]>();
  for (const s of sets) byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s]);
  const out: E1rmPoint[] = [];
  for (const list of byWorkout.values()) {
    const { sets: use, rough } = e1rmCandidates(list);
    let best: E1rmPoint | undefined;
    for (const s of use) {
      const e = estimate1rm(formula, s.load, s.reps);
      if (e > 0 && (!best || e > best.e1rm)) best = { date: s.date, workoutId: s.workoutId, e1rm: e, load: s.load, reps: s.reps, ...(rough ? { rough: true } : {}) };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
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
  /**
   * A rep record set by a set with MORE reps (a heavier 5 is also a 3-rep best). Saved quietly:
   * `detectPrs` leaves these out unless asked, so they never show as a new PR.
   */
  implied?: boolean;
}

/** Rep records are tracked for every count from 1 to this. */
export const PR_MAX_REPS = 20;

/**
 * Personal records in time order, workout by workout. A record needs an earlier value to beat,
 * so the very first value of each kind is a baseline, not a PR. Ties are not PRs.
 * - rep: heaviest load at N reps OR MORE, for N = 1 to `PR_MAX_REPS` (a heavier 5 is also a best for 1 to 4 reps).
 *   Only the rep count of the set itself is reported; the lower counts it also beats are `implied`
 *   and returned only with `includeImplied`.
 * - e1rm: highest estimate with `formula` (same set choice as `e1rmSeries`).
 * - volume: total load × reps of the exercise in one workout.
 */
export function detectPrs(sets: readonly LiftSet[], formula: E1rmFormula, opts: { includeImplied?: boolean } = {}): PrEvent[] {
  const byWorkout = new Map<ID, LiftSet[]>();
  for (const s of sets) {
    const arr = byWorkout.get(s.workoutId);
    if (arr) arr.push(s);
    else byWorkout.set(s.workoutId, [s]);
  }
  const workouts = [...byWorkout.entries()]
    .map(([id, list]) => ({ id, list, date: list.reduce((m, s) => (s.date < m ? s.date : m), list[0]!.date) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const bestRep = new Map<number, number>();
  let bestE1rm = 0;
  let bestVol = 0;
  const events: PrEvent[] = [];

  for (const w of workouts) {
    // Rep-range PRs.
    for (let r = 1; r <= PR_MAX_REPS; r++) {
      const eligible = w.list.filter((s) => s.reps >= r);
      if (!eligible.length) continue;
      const top = Math.max(...eligible.map((s) => s.load));
      const prev = bestRep.get(r);
      if (prev !== undefined && top > prev) {
        const exact = eligible.some((s) => s.reps === r && s.load === top);
        if (exact || opts.includeImplied) events.push({ kind: 'rep', date: w.date, workoutId: w.id, reps: r, value: top, previous: prev, ...(exact ? {} : { implied: true }) });
      }
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
