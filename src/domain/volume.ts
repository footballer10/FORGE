import { addDays, localDateKey, weekStart } from './calendar';
import { bodyweightOn, effectiveLoad, isAnalyticSet } from './load';
import type { BodyMetric, Exercise, ID, Muscle, SetEntry, WeightUnit, Workout } from './types';

/** Credit a primary muscle gets per hard set, and a secondary muscle. Shown in the UI. */
export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;

/** One hard set (completed, non-warm-up) with the muscles it trains. */
export interface VolumeSet {
  /** Local day `YYYY-MM-DD`. */
  day: string;
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  /** Load × reps in the analysis unit; 0 when unknown. */
  volume: number;
}

/**
 * Build hard sets from raw rows. Skips warm-ups, incomplete sets, deleted rows and sets of
 * unfinished or trashed workouts. `volume` follows `effectiveLoad` (0 when the load is unknown).
 */
export function volumeSets(
  sets: readonly SetEntry[],
  exercises: ReadonlyMap<ID, Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles' | 'loadModel'>>,
  workouts: ReadonlyMap<ID, Pick<Workout, 'endedAt' | 'deletedAt' | 'bodyweight'>>,
  metrics: readonly BodyMetric[],
  unit: WeightUnit,
): VolumeSet[] {
  const out: VolumeSet[] = [];
  for (const s of sets) {
    if (s.deletedAt || !isAnalyticSet(s)) continue;
    const w = workouts.get(s.workoutId);
    const ex = exercises.get(s.exerciseId);
    if (!w || !ex || !w.endedAt || w.deletedAt) continue;
    const completed = s.completedAt as string;
    const day = localDateKey(completed);
    const bw = bodyweightOn(day, metrics as BodyMetric[]) ?? w.bodyweight;
    const load = s.reps ? effectiveLoad(s, ex, bw, unit) : null;
    out.push({ day, primary: ex.primaryMuscles, secondary: ex.secondaryMuscles, volume: load && s.reps ? load * s.reps : 0 });
  }
  return out;
}

export interface MuscleTotals {
  /** Weighted hard sets per muscle (primary 1.0, secondary 0.5). */
  byMuscle: Map<Muscle, number>;
  /** Plain count of hard sets in the window. */
  sets: number;
  /** Hard sets whose exercise has no muscles assigned (not in `byMuscle`). */
  unassigned: number;
  volume: number;
}

/** Totals for days in `[from, to)` (local day keys). */
export function totalsBetween(sets: readonly VolumeSet[], from: string, to: string): MuscleTotals {
  const byMuscle = new Map<Muscle, number>();
  let count = 0;
  let unassigned = 0;
  let volume = 0;
  for (const s of sets) {
    if (s.day < from || s.day >= to) continue;
    count += 1;
    volume += s.volume;
    if (!s.primary.length && !s.secondary.length) unassigned += 1;
    for (const m of s.primary) byMuscle.set(m, (byMuscle.get(m) ?? 0) + PRIMARY_WEIGHT);
    for (const m of s.secondary) if (!s.primary.includes(m)) byMuscle.set(m, (byMuscle.get(m) ?? 0) + SECONDARY_WEIGHT);
  }
  return { byMuscle, sets: count, unassigned, volume };
}

/** Weekly (Monday-start) totals for the last `weeks` weeks ending with the week containing `today`, oldest first. */
export function weeklyTotals(sets: readonly VolumeSet[], today: string, weeks: number): { week: string; totals: MuscleTotals }[] {
  const last = weekStart(today);
  const out: { week: string; totals: MuscleTotals }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const week = addDays(last, -7 * i);
    out.push({ week, totals: totalsBetween(sets, week, addDays(week, 7)) });
  }
  return out;
}

export type PeriodPreset = 'month' | '3m' | '6m' | '12m';

export interface PeriodWindows {
  current: { from: string; to: string };
  previous: { from: string; to: string };
  label: string;
  previousLabel: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const firstOfMonth = (y: number, m0: number) => {
  const d = new Date(y, m0, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};

/**
 * Comparison windows (end exclusive).
 * - month: this calendar month so far vs the whole last calendar month.
 * - 3m / 6m / 12m: the last N months up to and including today vs the N months before that.
 */
export function periodWindows(today: string, preset: PeriodPreset): PeriodWindows {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const tomorrow = addDays(today, 1);
  if (preset === 'month') {
    return {
      current: { from: firstOfMonth(y, m - 1), to: tomorrow },
      previous: { from: firstOfMonth(y, m - 2), to: firstOfMonth(y, m - 1) },
      label: 'This month so far',
      previousLabel: 'Last month',
    };
  }
  const n = preset === '3m' ? 3 : preset === '6m' ? 6 : 12;
  // Windows start on the first day after `today` shifted back n months (same day-of-month, clamped).
  const shift = (months: number) => {
    const d = new Date(y, m - 1 - months, 1);
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(Number(today.slice(8)), dim));
    return addDays(localDateKey(d), 1);
  };
  return {
    current: { from: shift(n), to: tomorrow },
    previous: { from: shift(2 * n), to: shift(n) },
    label: `Last ${n} months`,
    previousLabel: `Previous ${n} months`,
  };
}

export interface ComparisonRow {
  muscle: Muscle;
  current: number;
  previous: number;
  /** Change in weighted sets; percent is undefined when the previous value is 0. */
  delta: number;
  percent?: number;
}

/** Per-muscle comparison of two windows, biggest absolute change first. Totals are plain sums, not rates. */
export function compareWindows(current: MuscleTotals, previous: MuscleTotals): ComparisonRow[] {
  const muscles = new Set<Muscle>([...current.byMuscle.keys(), ...previous.byMuscle.keys()]);
  return [...muscles]
    .map((muscle) => {
      const c = current.byMuscle.get(muscle) ?? 0;
      const p = previous.byMuscle.get(muscle) ?? 0;
      return { muscle, current: c, previous: p, delta: c - p, percent: p > 0 ? ((c - p) / p) * 100 : undefined };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.muscle.localeCompare(b.muscle));
}

export interface PlateauResult {
  plateau: boolean;
  /** Best e1RM before the window. */
  bestBefore: number;
  /** Best e1RM inside the window. */
  bestRecent: number;
  sessionsInWindow: number;
  /** Day of the best-before value (the last gain). */
  since?: string;
}

/**
 * Plateau: no e1RM gain in the last `weeks` weeks. Needs a best value from before the window and at
 * least `minSessions` sessions inside it (a lay-off is not a plateau). Gain = the window's best strictly beats the earlier best.
 */
export function detectPlateau(
  series: readonly { date: string; e1rm: number }[],
  today: string,
  weeks: number,
  minSessions = 3,
): PlateauResult {
  const cutoff = addDays(today, -7 * weeks);
  let bestBefore = 0;
  let since: string | undefined;
  let bestRecent = 0;
  let sessions = 0;
  for (const p of series) {
    const day = localDateKey(p.date);
    if (day < cutoff) {
      if (p.e1rm > bestBefore) {
        bestBefore = p.e1rm;
        since = day;
      }
    } else {
      sessions += 1;
      bestRecent = Math.max(bestRecent, p.e1rm);
    }
  }
  return { plateau: bestBefore > 0 && sessions >= minSessions && bestRecent <= bestBefore, bestBefore, bestRecent, sessionsInWindow: sessions, since };
}
