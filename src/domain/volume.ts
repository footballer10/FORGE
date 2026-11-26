import { addDays, localDateKey, weekStart } from './calendar';
import { bodyweightOn, effectiveLoad, isAnalyticSet } from './load';
import type { BodyMetric, Exercise, ID, MovementPattern, Muscle, SetEntry, WeightUnit, Workout } from './types';

/** Credit a primary muscle gets per hard set, and a secondary muscle. Shown in the UI. */
export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;

/** One hard set (completed, non-warm-up) with the muscles it trains. */
export interface VolumeSet {
  /** Local day `YYYY-MM-DD`. */
  day: string;
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  pattern?: MovementPattern;
  /** Load × reps in the analysis unit; 0 when unknown. */
  volume: number;
}

/**
 * Build hard sets from raw rows. Skips warm-ups, incomplete sets, deleted rows and sets of
 * unfinished or trashed workouts. `volume` follows `effectiveLoad` (0 when the load is unknown).
 */
export function volumeSets(
  sets: readonly SetEntry[],
  exercises: ReadonlyMap<ID, Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles' | 'loadModel' | 'pattern'>>,
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
    out.push({ day, primary: ex.primaryMuscles, secondary: ex.secondaryMuscles, pattern: ex.pattern, volume: load && s.reps ? load * s.reps : 0 });
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

/** Weeks a plateau is judged over. Older history is ignored, so coming back after a lay-off is not a plateau. */
export const PLATEAU_WEEKS = 4;

/**
 * Plateau: within the last `weeks` weeks only, no session beat the first session in that window
 * (needs at least `minSessions` sessions in the window). Anything before the window is ignored.
 * `bestBefore` = the first session's e1RM in the window, `since` its date; `bestRecent` = the best after it.
 */
export function detectPlateau(
  series: readonly { date: string; e1rm: number }[],
  today: string,
  weeks: number = PLATEAU_WEEKS,
  minSessions = 3,
): PlateauResult {
  const cutoff = addDays(today, -7 * weeks);
  const inWindow = series
    .map((p) => ({ day: localDateKey(p.date), e1rm: p.e1rm }))
    .filter((p) => p.day >= cutoff && p.day <= today)
    .sort((x, y) => x.day.localeCompare(y.day));
  const first = inWindow[0];
  const later = inWindow.slice(1);
  const bestRecent = later.length ? Math.max(...later.map((p) => p.e1rm)) : 0;
  return {
    plateau: !!first && inWindow.length >= minSessions && bestRecent <= first.e1rm,
    bestBefore: first?.e1rm ?? 0,
    bestRecent,
    sessionsInWindow: inWindow.length,
    since: first?.day,
  };
}

export interface BalanceCheck {
  id: 'pushPull' | 'squatHinge';
  label: string;
  /** Names of the two sides and what they include, shown in the UI. */
  a: { name: string; sets: number; includes: string };
  b: { name: string; sets: number; includes: string };
  /** a ÷ b; undefined when b is 0. */
  ratio?: number;
  status: 'balanced' | 'aHeavy' | 'bHeavy' | 'noData';
  /** Plain-language rule, including the thresholds. */
  rule: string;
}

/** A side counts as heavy when it has more than this many times the sets of the other. */
export const BALANCE_LIMIT = 1.5;

const PUSH: MovementPattern[] = ['horizontalPush', 'verticalPush'];
const PULL: MovementPattern[] = ['horizontalPull', 'verticalPull'];
const SQUAT: MovementPattern[] = ['squat', 'lunge'];
const HINGE: MovementPattern[] = ['hinge'];

function status(a: number, b: number): BalanceCheck['status'] {
  if (a + b === 0) return 'noData';
  if (b === 0 || a / b > BALANCE_LIMIT) return 'aHeavy';
  if (a === 0 || b / a > BALANCE_LIMIT) return 'bHeavy';
  return 'balanced';
}

/**
 * Push:pull and squat:hinge from hard-set counts by movement pattern for days in `[from, to)`.
 * Each set counts once for its exercise's pattern (muscle credit is not used). Exercises with pattern
 * other / isolation / core are ignored.
 */
export function balanceChecks(sets: readonly VolumeSet[], from: string, to: string): BalanceCheck[] {
  const count = (pats: MovementPattern[]) =>
    sets.filter((s) => s.day >= from && s.day < to && s.pattern && pats.includes(s.pattern)).length;
  const push = count(PUSH), pull = count(PULL), squat = count(SQUAT), hinge = count(HINGE);
  const rule = `Flagged when one side has more than ${BALANCE_LIMIT}× the sets of the other.`;
  return [
    {
      id: 'pushPull', label: 'Push : pull',
      a: { name: 'Push', sets: push, includes: 'horizontal and vertical pushing (bench, press, dips)' },
      b: { name: 'Pull', sets: pull, includes: 'horizontal and vertical pulling (rows, pull-ups)' },
      ratio: pull > 0 ? push / pull : undefined, status: status(push, pull), rule,
    },
    {
      id: 'squatHinge', label: 'Squat : hinge',
      a: { name: 'Squat', sets: squat, includes: 'squat and lunge patterns' },
      b: { name: 'Hinge', sets: hinge, includes: 'deadlift and hip-hinge patterns' },
      ratio: hinge > 0 ? squat / hinge : undefined, status: status(squat, hinge), rule,
    },
  ];
}
