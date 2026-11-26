/**
 * Overall strength over time (pure). Each included lift's level in a week is its best estimated 1RM in
 * the 4 weeks ending that week (so one off day does not drag it down), held for up to 12 weeks after
 * it was last trained. The index is the average of every lift's level divided by that lift's first
 * level, × 100: 100 = where you started, 110 = 10% stronger on average. Every lift counts equally, so
 * squats do not drown out curls, and adding a lift later does not make the line jump.
 */
import { addDays, localDateKey } from './calendar';

export const INDEX_WINDOW_DAYS = 28;
export const INDEX_HOLD_WEEKS = 12;

export interface IndexPoint {
  /** Week end, local YYYY-MM-DD. */
  date: string;
  index: number;
  /** How many lifts contributed. */
  lifts: number;
}

/** Week-end dates (every 7 days, ending today) from the week of `first` to `today`. */
export function weekEnds(first: string, today: string): string[] {
  const out: string[] = [];
  for (let d = today; d >= first; d = addDays(d, -7)) out.unshift(d);
  if (!out.length || out[0]! > first) out.unshift(addDays(out[0] ?? today, -7));
  return out;
}

/** Per week end: best e1RM in the window, else the last known level within the hold period, else undefined. */
export function rollingLevels(series: readonly { date: string; e1rm: number }[], ends: readonly string[]): (number | undefined)[] {
  const pts = series.map((p) => ({ day: localDateKey(p.date), e1rm: p.e1rm })).sort((a, b) => a.day.localeCompare(b.day));
  let last: { level: number; day: string } | undefined;
  return ends.map((end) => {
    const from = addDays(end, -(INDEX_WINDOW_DAYS - 1));
    const inWindow = pts.filter((p) => p.day >= from && p.day <= end);
    if (inWindow.length) {
      last = { level: Math.max(...inWindow.map((p) => p.e1rm)), day: end };
      return last.level;
    }
    if (last && end <= addDays(last.day, INDEX_HOLD_WEEKS * 7)) return last.level;
    return undefined;
  });
}

export function strengthIndex(perLift: ReadonlyMap<string, readonly { date: string; e1rm: number }[]>, today: string): IndexPoint[] {
  const firsts = [...perLift.values()].flatMap((s) => s.map((p) => localDateKey(p.date)));
  if (!firsts.length) return [];
  const ends = weekEnds(firsts.reduce((a, b) => (a < b ? a : b)), today);
  const levels = [...perLift.values()].map((s) => rollingLevels(s, ends));
  const baselines = levels.map((l) => l.find((v) => v !== undefined));
  const out: IndexPoint[] = [];
  ends.forEach((date, i) => {
    let sum = 0;
    let n = 0;
    levels.forEach((l, k) => {
      const v = l[i];
      const base = baselines[k];
      if (v !== undefined && base) {
        sum += v / base;
        n++;
      }
    });
    if (n) out.push({ date, index: Math.round((sum / n) * 1000) / 10, lifts: n });
  });
  return out;
}
