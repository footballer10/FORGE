import type { ReadinessCheckIn } from './types';

/** Shown next to every readiness number (CLAUDE.md: analytics show formula and inputs). */
export const READINESS_FORMULA =
  'Readiness (1–5) = average of sleep points, (6 − soreness) and energy. Sleep points = hours slept − 4, kept between 1 and 5 (5 h → 1, 9 h or more → 5). Any part you skip is left out.';

export interface ReadinessScore {
  score: number;
  sleepPts?: number;
  freshness?: number;
  energy?: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function sleepPoints(hours: number): number {
  return Math.min(5, Math.max(1, hours - 4));
}

/** Score for one check-in, or undefined when nothing was answered. */
export function readinessScore(c: Pick<ReadinessCheckIn, 'sleepHours' | 'soreness' | 'energy'>): ReadinessScore | undefined {
  const parts: Omit<ReadinessScore, 'score'> = {};
  if (c.sleepHours !== undefined) parts.sleepPts = sleepPoints(c.sleepHours);
  if (c.soreness !== undefined) parts.freshness = 6 - c.soreness;
  if (c.energy !== undefined) parts.energy = c.energy;
  const vals = Object.values(parts) as number[];
  if (!vals.length) return undefined;
  return { score: r1(vals.reduce((a, b) => a + b, 0) / vals.length), ...parts };
}

/** Latest live check-in for a date (YYYY-MM-DD). */
export function checkInFor(list: readonly ReadinessCheckIn[], date: string): ReadinessCheckIn | undefined {
  return list.filter((c) => !c.deletedAt && c.date === date).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export interface ReadinessPoint {
  date: string;
  score: number;
  sleepHours?: number;
  soreness?: number;
  energy?: number;
}

export interface ReadinessTrend {
  points: ReadinessPoint[];
  /** Mean score of the last 7 days that have a check-in (ending today). */
  avg7?: number;
  /** Mean score over the window. */
  avgWindow?: number;
  avgSleepHours?: number;
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mean = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined);

/** One point per day with a check-in, oldest first, for the `days` ending `today`. */
export function readinessTrend(list: readonly ReadinessCheckIn[], today: string, days = 28): ReadinessTrend {
  const from = addDays(today, -(days - 1));
  const from7 = addDays(today, -6);
  const dates = [...new Set(list.filter((c) => !c.deletedAt && c.date >= from && c.date <= today).map((c) => c.date))].sort();
  const points: ReadinessPoint[] = [];
  for (const date of dates) {
    const c = checkInFor(list, date)!;
    const s = readinessScore(c);
    if (!s) continue;
    points.push({
      date,
      score: s.score,
      ...(c.sleepHours !== undefined ? { sleepHours: c.sleepHours } : {}),
      ...(c.soreness !== undefined ? { soreness: c.soreness } : {}),
      ...(c.energy !== undefined ? { energy: c.energy } : {}),
    });
  }
  const sleep = points.flatMap((p) => (p.sleepHours !== undefined ? [p.sleepHours] : []));
  const out: ReadinessTrend = { points };
  const a7 = mean(points.filter((p) => p.date >= from7).map((p) => p.score));
  const aw = mean(points.map((p) => p.score));
  const as = mean(sleep);
  if (a7 !== undefined) out.avg7 = a7;
  if (aw !== undefined) out.avgWindow = aw;
  if (as !== undefined) out.avgSleepHours = as;
  return out;
}
