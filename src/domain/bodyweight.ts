/** Bodyweight log maths: one value per day and a smoothed trend (EWMA). Pure; no storage or UI. */
import { addDays } from './calendar';
import { convertWeight } from './units';
import type { BodyMetric, WeightUnit } from './types';

/** Smoothing per day: each day moves the trend this share of the way to that day's weigh-in. */
export const EWMA_ALPHA = 0.1;
export const TREND_FORMULA = 'trend = previous trend + α × (weigh-in − previous trend), α = 0.1 per day';

export interface DayWeight {
  date: string;
  /** Average of that day's weigh-ins, in the analysis unit. */
  value: number;
  count: number;
}
export interface TrendPoint extends DayWeight {
  trend: number;
}

const diffDays = (a: string, b: string): number => {
  let n = 0;
  let k = a;
  while (k < b && n < 4000) {
    k = addDays(k, 1);
    n++;
  }
  return n;
};

/** One value per day (several weigh-ins on a day are averaged), converted to `unit`, oldest first. Trashed rows are ignored. */
export function dailyWeights(metrics: BodyMetric[], unit: WeightUnit): DayWeight[] {
  const byDay = new Map<string, number[]>();
  for (const m of metrics) {
    if (m.kind !== 'bodyweight' || m.deletedAt) continue;
    if (m.unit !== 'lb' && m.unit !== 'kg') continue;
    const list = byDay.get(m.date) ?? [];
    list.push(convertWeight(m.value, m.unit, unit));
    byDay.set(m.date, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, vs]) => ({ date, value: vs.reduce((s, v) => s + v, 0) / vs.length, count: vs.length }));
}

/**
 * Exponentially weighted trend. The first weigh-in seeds the trend. After a gap of g days the smoothing is
 * 1 − (1 − α)^g, so skipped days count as if the trend carried on without new information.
 */
export function ewmaTrend(days: DayWeight[], alpha = EWMA_ALPHA): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const d of days) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...d, trend: d.value });
      continue;
    }
    const gap = Math.max(1, diffDays(prev.date, d.date));
    const a = 1 - Math.pow(1 - alpha, gap);
    out.push({ ...d, trend: prev.trend + a * (d.value - prev.trend) });
  }
  return out;
}

/** Change in trend over the last `days` days (latest point vs the last point on or before that date). Undefined if too little data. */
export function trendChange(points: TrendPoint[], days: number): { from: TrendPoint; to: TrendPoint; delta: number } | undefined {
  const to = points[points.length - 1];
  if (!to) return undefined;
  const cutoff = addDays(to.date, -days);
  let from: TrendPoint | undefined;
  for (const p of points) if (p.date <= cutoff) from = p;
  if (!from) return undefined;
  return { from, to, delta: to.trend - from.trend };
}
