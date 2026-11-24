import { addDays, localDateKey, weekStart } from './calendar';
import type { ID } from './types';

/**
 * Weekly streaks against planned days. A week (Monday to Sunday, local days) is a hit when the
 * number of distinct training days reaches the target (planned days per week). No daily pressure:
 * only whole weeks count, and rest days are fine. The week in progress never breaks a streak.
 */

export interface StreakWorkout {
  id: ID;
  /** ISO start time of a finished, non-trashed workout. */
  startedAt: string;
}

export interface WeekResult {
  /** Monday, local `YYYY-MM-DD`. */
  weekStart: string;
  /** Distinct training days that week. */
  days: number;
  hit: boolean;
  /** When the target was reached (ISO start of the workout on the target-th day) and which workout did it. */
  hitAt?: string;
  workoutId?: ID;
}

/** One result per week from the first workout's week through `today`'s week, gaps included. Empty with no target or workouts. */
export function weeklyResults(workouts: readonly StreakWorkout[], target: number, today: string): WeekResult[] {
  if (!(target >= 1) || !workouts.length) return [];
  const sorted = [...workouts].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const byWeek = new Map<string, { day: string; id: ID; at: string }[]>();
  for (const w of sorted) {
    const day = localDateKey(w.startedAt);
    const wk = weekStart(day);
    const arr = byWeek.get(wk);
    const item = { day, id: w.id, at: w.startedAt };
    if (arr) arr.push(item);
    else byWeek.set(wk, [item]);
  }
  const first = weekStart(localDateKey((sorted[0] as StreakWorkout).startedAt));
  const last = weekStart(today);
  const out: WeekResult[] = [];
  for (let wk = first; wk <= last; wk = addDays(wk, 7)) {
    const items = byWeek.get(wk) ?? [];
    const seen = new Set<string>();
    let hitAt: string | undefined;
    let workoutId: ID | undefined;
    for (const it of items) {
      if (seen.has(it.day)) continue;
      seen.add(it.day);
      if (seen.size === Math.ceil(target) && !hitAt) {
        hitAt = it.at;
        workoutId = it.id;
      }
    }
    out.push({ weekStart: wk, days: seen.size, hit: !!hitAt, ...(hitAt ? { hitAt, workoutId } : {}) });
  }
  return out;
}

/** Lengths of every run of consecutive hit weeks, with the week each run reached each length. */
export function streakRuns(results: readonly WeekResult[]): { length: number; result: WeekResult }[] {
  const out: { length: number; result: WeekResult }[] = [];
  let run = 0;
  for (const r of results) {
    run = r.hit ? run + 1 : 0;
    if (r.hit) out.push({ length: run, result: r });
  }
  return out;
}

export interface StreakSummary {
  target: number;
  /** Consecutive hit weeks ending last week, plus this week if it is already a hit. */
  current: number;
  longest: number;
  /** Training days so far this week. */
  thisWeekDays: number;
  thisWeekHit: boolean;
}

export function streakSummary(results: readonly WeekResult[], target: number): StreakSummary {
  const thisWeek = results[results.length - 1];
  let current = 0;
  let i = results.length - 1;
  if (thisWeek && !thisWeek.hit) i -= 1; // the week in progress does not break the streak
  for (; i >= 0 && results[i]?.hit; i -= 1) current += 1;
  const longest = streakRuns(results).reduce((m, r) => Math.max(m, r.length), 0);
  return { target, current, longest, thisWeekDays: thisWeek?.days ?? 0, thisWeekHit: !!thisWeek?.hit };
}
