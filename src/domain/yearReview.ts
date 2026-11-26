import { addDays, localDateKey, weekStart } from './calendar';
import { E1RM_FORMULA } from './e1rm';
import { detectPrs, e1rmSeries, type LiftSet } from './prs';

/** One lift's analytic sets (warm-ups already excluded by `liftSets`), all time. */
export interface ReviewLift {
  exerciseId: string;
  name: string;
  sets: LiftSet[];
}

export interface YearReviewInput {
  year: number;
  /** Finished, not-deleted workouts (any year). */
  workouts: { id: string; startedAt: string; endedAt?: string }[];
  lifts: ReviewLift[];
  /** Workouts per week that count as a streak week (Profile.plannedDaysPerWeek). */
  weeklyTarget: number;
}

export interface YearReview {
  year: number;
  workouts: number;
  hours: number;
  workingSets: number;
  reps: number;
  /** Σ load × reps of working sets, analysis unit. perImplement counts one dumbbell (never doubled). */
  totalVolume: number;
  /** Rep and e1RM PRs set in the year (exact rep counts only). */
  prCount: number;
  /** Most working sets in the year. */
  mostTrained: { name: string; sets: number }[];
  heaviestSet?: { name: string; load: number; reps: number; date: string };
  /** Best e1RM in the year minus the best before the year (or the year's first session when new). */
  e1rmGains: { name: string; from: number; to: number; gain: number; since: 'lastYear' | 'firstSession' }[];
  /** Longest run of consecutive Monday weeks with at least `weeklyTarget` workouts. */
  longestStreakWeeks: number;
  /** Local date of the busiest training week's Monday, with its workout count. */
  busiestWeek?: { weekOf: string; workouts: number };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const inYear = (iso: string, year: number) => localDateKey(iso).startsWith(`${year}-`);

export const YEAR_REVIEW_NOTES =
  'Warm-ups are left out. Volume = load × reps of working sets (bodyweight lifts use bodyweight that day; dumbbells count one dumbbell). e1RM uses Epley on each session\'s best set. A streak week has at least your planned number of workouts.';

export function yearReview(i: YearReviewInput): YearReview {
  const ws = i.workouts.filter((w) => inYear(w.startedAt, i.year));
  const ms = ws.reduce((t, w) => t + (w.endedAt ? Math.max(0, Date.parse(w.endedAt) - Date.parse(w.startedAt)) : 0), 0);

  let workingSets = 0;
  let reps = 0;
  let volume = 0;
  let prCount = 0;
  let heaviest: YearReview['heaviestSet'];
  const trained: { name: string; sets: number }[] = [];
  const gains: YearReview['e1rmGains'] = [];
  const start = `${i.year}-01-01`;

  for (const lift of i.lifts) {
    const yearSets = lift.sets.filter((s) => inYear(s.date, i.year));
    if (!yearSets.length) continue;
    workingSets += yearSets.length;
    trained.push({ name: lift.name, sets: yearSets.length });
    for (const s of yearSets) {
      reps += s.reps;
      volume += s.load * s.reps;
      if (!heaviest || s.load > heaviest.load || (s.load === heaviest.load && s.reps > heaviest.reps)) {
        heaviest = { name: lift.name, load: r1(s.load), reps: s.reps, date: localDateKey(s.date) };
      }
    }
    prCount += detectPrs(lift.sets, E1RM_FORMULA).filter((e) => e.kind !== 'volume' && inYear(e.date, i.year)).length;

    const series = e1rmSeries(lift.sets, E1RM_FORMULA);
    const before = series.filter((p) => localDateKey(p.date) < start);
    const during = series.filter((p) => inYear(p.date, i.year));
    if (!during.length) continue;
    const best = Math.max(...during.map((p) => p.e1rm));
    const from = before.length ? Math.max(...before.map((p) => p.e1rm)) : during[0]!.e1rm;
    if (best > from) gains.push({ name: lift.name, from: r1(from), to: r1(best), gain: r1(best - from), since: before.length ? 'lastYear' : 'firstSession' });
  }

  // Weekly streak inside the year.
  const perWeek = new Map<string, number>();
  for (const w of ws) {
    const k = weekStart(localDateKey(w.startedAt));
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }
  let longest = 0;
  let run = 0;
  const target = Math.max(1, i.weeklyTarget);
  const last = `${i.year}-12-31`;
  for (let k = weekStart(start); k <= last; k = addDays(k, 7)) {
    run = (perWeek.get(k) ?? 0) >= target ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const busiest = [...perWeek.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  return {
    year: i.year,
    workouts: ws.length,
    hours: r1(ms / 3_600_000),
    workingSets,
    reps,
    totalVolume: Math.round(volume),
    prCount,
    mostTrained: trained.sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name)).slice(0, 3),
    ...(heaviest ? { heaviestSet: heaviest } : {}),
    e1rmGains: gains.sort((a, b) => b.gain - a.gain).slice(0, 5),
    longestStreakWeeks: longest,
    ...(busiest ? { busiestWeek: { weekOf: busiest[0], workouts: busiest[1] } } : {}),
  };
}

/** Years that have at least one finished workout, newest first. */
export function reviewYears(workouts: readonly { startedAt: string }[]): number[] {
  return [...new Set(workouts.map((w) => Number(localDateKey(w.startedAt).slice(0, 4))))].sort((a, b) => b - a);
}
