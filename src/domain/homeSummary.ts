/** Small numbers for the Home screen (pure). */
import { addDays, localDateKey, weekStart } from './calendar';
import { isAnalyticSet } from './load';
import { dailyWeights, ewmaTrend, trendChange } from './bodyweight';
import type { BodyMetric, ID, SetEntry, WeightUnit, Workout } from './types';

export interface WeekSummary {
  /** Finished workouts started this week (Monday onward, local days). */
  sessions: number;
  /** Completed non-warm-up sets this week. */
  hardSets: number;
  /** The same count for the whole of last week, for comparison. */
  lastWeekSets: number;
}

export function weekSummary(sets: readonly SetEntry[], workouts: ReadonlyMap<ID, Workout>, today: string): WeekSummary {
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const counted = new Set<ID>();
  let hardSets = 0;
  let lastWeekSets = 0;
  for (const s of sets) {
    const w = workouts.get(s.workoutId);
    if (!w || w.deletedAt || !w.endedAt || s.deletedAt || !isAnalyticSet(s)) continue;
    const day = localDateKey(w.startedAt);
    if (day >= thisWeek && day <= today) hardSets++;
    else if (day >= lastWeek && day < thisWeek) lastWeekSets++;
  }
  for (const w of workouts.values()) {
    if (w.deletedAt || !w.endedAt) continue;
    const day = localDateKey(w.startedAt);
    if (day >= thisWeek && day <= today) counted.add(w.id);
  }
  return { sessions: counted.size, hardSets, lastWeekSets };
}

export interface WeightSummary {
  latest: number;
  /** Smoothed trend change over the last 7 days, when there is data from a week ago. */
  weekChange?: number;
  unit: WeightUnit;
}

export function weightSummary(metrics: BodyMetric[], unit: WeightUnit): WeightSummary | undefined {
  const points = ewmaTrend(dailyWeights(metrics, unit));
  const last = points.at(-1);
  if (!last) return undefined;
  const ch = trendChange(points, 7);
  return { latest: Math.round(last.value * 10) / 10, unit, ...(ch ? { weekChange: Math.round(ch.delta * 10) / 10 } : {}) };
}
