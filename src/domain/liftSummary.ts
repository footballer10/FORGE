import { addDays, localDateKey } from './calendar';

export interface LiftSummary {
  /** Best e1RM in the last `days` days; falls back to the latest session when there is none. */
  current: number;
  /** current minus the best e1RM in the `days` days before that window; undefined without both. */
  change?: number;
  /** True when `current` came from a session older than the window. */
  stale: boolean;
}

/**
 * One-line summary of a lift for the Strength list. Window = the last `days` days ending `today`
 * (local `YYYY-MM-DD`); the comparison window is the `days` days before it.
 */
export function liftSummary(series: readonly { date: string; e1rm: number }[], today: string, days = 28): LiftSummary | undefined {
  if (series.length === 0) return undefined;
  const recentFrom = addDays(today, -days);
  const priorFrom = addDays(today, -2 * days);
  let recent = 0;
  let prior = 0;
  for (const p of series) {
    const day = localDateKey(p.date);
    if (day > recentFrom) recent = Math.max(recent, p.e1rm);
    else if (day > priorFrom) prior = Math.max(prior, p.e1rm);
  }
  if (recent > 0) return { current: recent, ...(prior > 0 ? { change: recent - prior } : {}), stale: false };
  const latest = [...series].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
  return { current: latest.e1rm, stale: true };
}
