import { addDays, localDateKey } from './calendar';
import type { E1rmPoint, LiftSet, PrEvent } from './prs';
import type { ID, SetEntry, WeightUnit } from './types';

/** Rep counts shown in the Records segment. Same rule as rep PRs: the heaviest load lifted for that many reps or more. */
export const RECORD_REPS = [1, 3, 5, 8, 10, 12, 15] as const;

export interface RepRecord {
  reps: number;
  load: number;
  date: string;
}

/** Heaviest effective load at N reps or more for each N in `RECORD_REPS` (a heavier 5 counts for 3); earliest date wins a tie. Counts with no sets are omitted. */
export function repRecords(lifts: readonly LiftSet[]): RepRecord[] {
  const out: RepRecord[] = [];
  for (const reps of RECORD_REPS) {
    let best: RepRecord | undefined;
    for (const s of lifts) {
      if (s.reps < reps) continue;
      if (!best || s.load > best.load || (s.load === best.load && s.date < best.date)) best = { reps, load: s.load, date: s.date };
    }
    if (best) out.push(best);
  }
  return out;
}

export interface HistoryWorkout {
  workoutId: ID;
  /** Start of the first completed set, ISO. */
  date: string;
  /** Completed working sets (drop, failure, AMRAP included) in logged order. */
  working: { weight?: number; unit: WeightUnit; reps?: number; rpe?: number; type: SetEntry['type'] }[];
  warmups: number;
  /** Effective load × reps over the working sets, in the analysis unit (0 when the load is unknown). */
  volume: number;
}

/**
 * Workout-by-workout history of one exercise, newest first. Only completed sets count;
 * warm-ups are counted, not listed. `lifts` supplies each set's effective load for volume.
 */
export function exerciseHistory(sets: readonly SetEntry[], lifts: readonly LiftSet[], keepWorkout: (id: ID) => boolean): HistoryWorkout[] {
  const loadOf = new Map(lifts.map((l) => [l.setId, l.load]));
  const byWorkout = new Map<ID, SetEntry[]>();
  for (const s of sets) {
    if (s.deletedAt || !s.completedAt || !keepWorkout(s.workoutId)) continue;
    const arr = byWorkout.get(s.workoutId);
    if (arr) arr.push(s);
    else byWorkout.set(s.workoutId, [s]);
  }
  const out: HistoryWorkout[] = [];
  for (const [workoutId, list] of byWorkout) {
    list.sort((a, b) => a.order - b.order || (a.completedAt as string).localeCompare(b.completedAt as string));
    const working = list.filter((s) => s.type !== 'warmup');
    const warmups = list.length - working.length;
    if (working.length === 0) continue;
    out.push({
      workoutId,
      date: list.reduce((m, s) => ((s.completedAt as string) < m ? (s.completedAt as string) : m), list[0]!.completedAt as string),
      working: working.map((s) => ({
        ...(s.weight !== undefined ? { weight: s.weight } : {}),
        unit: s.unit,
        ...(s.reps !== undefined ? { reps: s.reps } : {}),
        ...(s.rpe !== undefined ? { rpe: s.rpe } : {}),
        type: s.type,
      })),
      warmups,
      volume: working.reduce((t, s) => t + (loadOf.get(s.id) ?? 0) * (s.reps ?? 0), 0),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export type ChartRange = '1m' | '3m' | '6m' | '1y' | 'all';
export const CHART_RANGES: { id: ChartRange; label: string; days?: number }[] = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 91 },
  { id: '6m', label: '6M', days: 182 },
  { id: '1y', label: '1Y', days: 365 },
  { id: 'all', label: 'All' },
];

/** Points inside the range ending `today` (local `YYYY-MM-DD`); 'all' keeps everything. */
export function inRange<T extends { date: string }>(points: readonly T[], range: ChartRange, today: string): T[] {
  const days = CHART_RANGES.find((r) => r.id === range)?.days;
  if (!days) return [...points];
  const from = addDays(today, -days);
  return points.filter((p) => localDateKey(p.date) >= from);
}

export interface PrBadge {
  label: string;
  date: string;
}

/**
 * Header badges: PRs set within the last `days` days (local), newest first, at most `max`.
 * One badge per kind and rep count (the latest one).
 */
export function recentPrBadges(prs: readonly PrEvent[], today: string, days = 30, max = 3): PrBadge[] {
  const from = addDays(today, -days);
  const seen = new Set<string>();
  const out: PrBadge[] = [];
  for (const p of [...prs].sort((a, b) => b.date.localeCompare(a.date))) {
    if (localDateKey(p.date) < from) continue;
    const key = `${p.kind}-${p.reps ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: p.kind === 'rep' ? `${p.reps}-rep PR` : p.kind === 'e1rm' ? 'e1RM PR' : 'Volume PR', date: p.date });
    if (out.length >= max) break;
  }
  return out;
}

/** Best e1RM point (highest value; earliest on a tie). */
export function bestPoint(series: readonly E1rmPoint[]): E1rmPoint | undefined {
  let best: E1rmPoint | undefined;
  for (const p of series) if (!best || p.e1rm > best.e1rm) best = p;
  return best;
}
