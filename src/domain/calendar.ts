/** Calendar and training-day heatmap maths. Dates are local `YYYY-MM-DD`; weeks start Monday. */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date key of an ISO timestamp (the day the user trained, not the UTC day). */
export function localDateKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export const addDays = (key: string, n: number): string => {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return localDateKey(d);
};

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const d = parseKey(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}

export interface DayStat {
  workouts: number;
  /** Completed non-warm-up sets. */
  hardSets: number;
}

/** Group finished workouts by local day. */
export function dayStats(items: readonly { startedAt: string; hardSets: number }[]): Map<string, DayStat> {
  const out = new Map<string, DayStat>();
  for (const it of items) {
    const k = localDateKey(it.startedAt);
    const cur = out.get(k) ?? { workouts: 0, hardSets: 0 };
    out.set(k, { workouts: cur.workouts + 1, hardSets: cur.hardSets + it.hardSets });
  }
  return out;
}

/** Month as Monday-first rows of 7 day keys; days outside the month are included (`inMonth` false). */
export function monthGrid(year: number, month0: number): { key: string; inMonth: boolean }[][] {
  const first = localDateKey(new Date(year, month0, 1));
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const rows: { key: string; inMonth: boolean }[][] = [];
  let cursor = weekStart(first);
  const end = localDateKey(new Date(year, month0, lastDay));
  while (cursor <= end) {
    rows.push(Array.from({ length: 7 }, (_, i) => {
      const key = addDays(cursor, i);
      const d = parseKey(key);
      return { key, inMonth: d.getMonth() === month0 && d.getFullYear() === year };
    }));
    cursor = addDays(cursor, 7);
  }
  return rows;
}

/** Heat level 0 (rest day) to 4, as a share of the busiest day in view: >0, >25%, >50%, >75% of `max`. */
export function heatLevel(hardSets: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (hardSets <= 0 || max <= 0) return 0;
  const r = hardSets / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

/** `weeks` Monday-first columns ending with the week of `today`; each column has 7 day keys. */
export function heatmapWeeks(today: string, weeks: number): string[][] {
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

/** Largest hardSets among the given days (for heatLevel). */
export function maxHardSets(stats: Map<string, DayStat>, keys: readonly string[]): number {
  return keys.reduce((m, k) => Math.max(m, stats.get(k)?.hardSets ?? 0), 0);
}
