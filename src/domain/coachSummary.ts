/**
 * Copy-for-Claude summary: turns precomputed numbers into plain text the user pastes into a Claude chat.
 * Pure formatting; the numbers come from the same analytics the app shows (see `coachRepo`).
 * Every figure is stated with its unit, window and formula so Claude (and the user) can check it.
 */
import type { BalanceCheck } from './volume';
import type { E1rmFormula, TargetSet, TrainingPhase, WeightUnit } from './types';

export const SUMMARY_RANGES = [
  { days: 28, label: '4 weeks' },
  { days: 56, label: '8 weeks' },
  { days: 84, label: '12 weeks' },
] as const;

export interface SummaryProfile {
  age?: number;
  sex?: string;
  heightCm?: number;
  goals: string[];
  sport?: string;
  position?: string;
  phase?: TrainingPhase;
  constraints: string[];
  plannedDaysPerWeek: number;
  equipment: { name: string; isDefault: boolean; items: string[]; maxDumbbell?: string; bar?: string; plates?: string; notes?: string }[];
}

export interface SummaryLift {
  name: string;
  /** Hard sets in the window. */
  sets: number;
  /** Best e1RM before the window, if any. */
  e1rmBefore?: number;
  /** Best e1RM inside the window, if any. */
  e1rmNow?: number;
  /** Top set text, e.g. "225 × 5". */
  topSet?: string;
  plateau?: boolean;
}

export interface SummaryPr {
  name: string;
  date: string;
  kind: 'rep' | 'e1rm' | 'volume';
  reps?: number;
  value: number;
  previous: number;
}

export interface SummaryTest {
  name: string;
  /** Absent when only a target or date is set and nothing was logged. */
  latest?: string;
  latestDate?: string;
  best?: string;
  /** Countdown text from `describeCountdown`: target, gap, test date and days left. */
  goal?: string;
}

export interface SummaryProgram {
  name: string;
  version: number;
  status: string;
  changeReason: string;
  /** Plan lines, one per planned session, already formatted. */
  sessions: string[];
  done: number;
  skipped: number;
  total: number;
}

export interface CoachSummaryInput {
  /** Local `YYYY-MM-DD`; the window is `[from, today]`. */
  today: string;
  from: string;
  days: number;
  unit: WeightUnit;
  formula: E1rmFormula;
  profile: SummaryProfile;
  bodyweight?: { latest: number; latestDate: string; trend: number; change28?: number };
  /** Readiness check-ins in the window (see domain/readiness). */
  readiness?: { checkIns: number; avg7?: number; avgWindow?: number; avgSleepHours?: number; latest?: { date: string; score: number; sleepHours?: number; soreness?: number; energy?: number } };
  sessions: number;
  conditioningSessions: number;
  hardSets: number;
  /** Total load × reps, analysis unit. */
  volume: number;
  /** Average weighted hard sets per week by muscle, highest first. */
  muscleSetsPerWeek: { muscle: string; sets: number }[];
  unassignedSets: number;
  balance: BalanceCheck[];
  lifts: SummaryLift[];
  prs: SummaryPr[];
  tests: SummaryTest[];
  program?: SummaryProgram;
}

const num = (n: number, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d);
const list = (items: string[]) => (items.length ? items.join('; ') : 'none recorded');

/** "3×5 @ 225 lb, 1×AMRAP" style text for one exercise's target sets. */
export function formatTargets(targets: readonly TargetSet[], fallbackUnit: WeightUnit): string {
  if (!targets.length) return 'no targets';
  const groups: { key: string; text: string; n: number }[] = [];
  for (const t of targets) {
    const reps = t.reps ? (t.repsMax && t.repsMax !== t.reps ? `${t.reps}-${t.repsMax}` : `${t.reps}`) : t.durationSec ? `${t.durationSec}s` : t.distanceM ? `${t.distanceM}m` : '?';
    const load = t.weight ? ` @ ${num(t.weight)} ${t.unit ?? fallbackUnit}` : t.percentE1rm ? ` @ ${num(t.percentE1rm * 100, 0)}% e1RM` : '';
    const rpe = t.rpe ? ` RPE ${t.rpe}` : '';
    const tag = t.type === 'warmup' ? 'warm-up ' : t.type === 'amrap' ? 'AMRAP ' : t.type === 'failure' ? 'to failure ' : t.type === 'drop' ? 'drop ' : '';
    const text = `${tag}${reps}${load}${rpe}`;
    const last = groups[groups.length - 1];
    if (last && last.key === text) last.n += 1;
    else groups.push({ key: text, text, n: 1 });
  }
  return groups.map((g) => `${g.n}×${g.text}`).join(', ');
}

function balanceLine(b: BalanceCheck): string {
  const ratio = b.ratio !== undefined ? `, ratio ${num(b.ratio, 2)}` : '';
  const flag = b.status === 'balanced' ? 'balanced' : b.status === 'noData' ? 'no data' : `${b.status === 'aHeavy' ? b.a.name : b.b.name}-heavy`;
  return `- ${b.label}: ${b.a.name} ${b.a.sets} sets vs ${b.b.name} ${b.b.sets} sets${ratio} (${flag})`;
}

/** The full text. Sections are stable so a pasted summary reads the same each time. */
export function buildCoachSummary(i: CoachSummaryInput): string {
  const u = i.unit;
  const p = i.profile;
  const weeks = i.days / 7;
  const out: string[] = [];

  out.push(`# Forge training summary`);
  out.push(`Window: ${i.from} to ${i.today} (${i.days} days, ${num(weeks, 0)} weeks, weeks start Monday). Weights in ${u}.`);
  out.push(`Warm-up sets are excluded from every figure. Dumbbell loads are per dumbbell. Only finished workouts count.`);

  out.push(``, `## Profile`);
  const bio = [p.age ? `age ${p.age}` : '', p.sex ?? '', p.heightCm ? `${num(p.heightCm, 0)} cm` : ''].filter(Boolean);
  if (bio.length) out.push(`- ${bio.join(', ')}`);
  out.push(`- Sport: ${[p.sport, p.position].filter(Boolean).join(' · ') || 'not set'}`);
  out.push(`- Phase: ${p.phase ?? 'not set'}`);
  out.push(`- Planned training days per week: ${p.plannedDaysPerWeek}`);
  out.push(`- Goals: ${list(p.goals)}`);
  out.push(`- Constraints: ${list(p.constraints)}`);
  for (const e of p.equipment) {
    const extra = [e.maxDumbbell && `dumbbells up to ${e.maxDumbbell}`, e.bar && `bar ${e.bar}`, e.plates && `plates ${e.plates}`, e.notes].filter(Boolean);
    out.push(`- Equipment${e.isDefault ? ' (default)' : ''} — ${e.name}: ${e.items.join(', ') || 'none listed'}${extra.length ? `; ${extra.join('; ')}` : ''}`);
  }

  out.push(``, `## Training in the window`);
  out.push(`- Strength/mixed sessions: ${i.sessions} (${num(i.sessions / weeks)} per week; plan was ${p.plannedDaysPerWeek})`);
  if (i.conditioningSessions) out.push(`- Conditioning sessions: ${i.conditioningSessions}`);
  out.push(`- Hard sets (completed, non-warm-up): ${i.hardSets} (${num(i.hardSets / weeks)} per week)`);
  out.push(`- Volume (load × reps, unknown loads count 0): ${Math.round(i.volume).toLocaleString('en-US')} ${u}`);

  out.push(``, `## Weekly hard sets per muscle`);
  out.push(`Average over the window. Primary muscle 1.0 per set, secondary 0.5.`);
  if (i.muscleSetsPerWeek.length) for (const m of i.muscleSetsPerWeek) out.push(`- ${m.muscle}: ${num(m.sets)}`);
  else out.push(`- no sets in the window`);
  if (i.unassignedSets) out.push(`- ${i.unassignedSets} sets are on exercises with no muscles assigned and are not counted above`);

  out.push(``, `## Balance (last 4 weeks)`);
  for (const b of i.balance) out.push(balanceLine(b));
  if (i.balance[0]) out.push(`Rule: ${i.balance[0].rule}`);

  out.push(``, `## Lifts`);
  out.push(`e1RM uses ${i.formula} on sets of 1-12 reps, best set per workout (a workout with only 13-20 rep sets gets a rough estimate). Plateau = no e1RM gain within the last 4 weeks, at least 3 sessions in that time.`);
  if (i.lifts.length) {
    for (const l of i.lifts) {
      const trend = l.e1rmNow !== undefined ? `e1RM ${num(l.e1rmNow)} ${u}${l.e1rmBefore !== undefined ? ` (best before window ${num(l.e1rmBefore)})` : ' (no earlier value)'}` : l.e1rmBefore !== undefined ? `no e1RM set in the window (best before ${num(l.e1rmBefore)} ${u})` : 'no e1RM (reps over 12 or load unknown)';
      out.push(`- ${l.name}: ${l.sets} sets; ${trend}${l.topSet ? `; top set ${l.topSet}` : ''}${l.plateau ? '; PLATEAU' : ''}`);
    }
  } else out.push(`- no loaded lifts in the window`);

  out.push(``, `## PRs in the window`);
  out.push(`The first value of each kind is a baseline, not a PR; ties are not PRs.`);
  if (i.prs.length) {
    for (const r of i.prs) {
      const what = r.kind === 'rep' ? `${r.reps}-rep best` : r.kind === 'e1rm' ? 'e1RM' : 'session volume';
      out.push(`- ${r.date} ${r.name}: ${what} ${num(r.value)} ${u} (was ${num(r.previous)})`);
    }
  } else out.push(`- none`);

  out.push(``, `## Body`);
  if (i.bodyweight) {
    const b = i.bodyweight;
    out.push(`- Bodyweight: ${num(b.latest)} ${u} on ${b.latestDate}; trend ${num(b.trend)} ${u} (EWMA, α 0.1 per day)${b.change28 !== undefined ? `; ${b.change28 >= 0 ? '+' : ''}${num(b.change28)} ${u} over 28 days` : ''}`);
  } else out.push(`- no weigh-ins`);
  if (i.readiness && i.readiness.checkIns) {
    const r = i.readiness;
    const l = r.latest;
    const parts = [
      `${r.checkIns} check-ins`,
      r.avg7 !== undefined ? `last 7 days ${num(r.avg7)}/5` : '',
      r.avgWindow !== undefined ? `window ${num(r.avgWindow)}/5` : '',
      r.avgSleepHours !== undefined ? `avg sleep ${num(r.avgSleepHours)} h` : '',
    ].filter(Boolean);
    out.push(`- Readiness (avg of sleep points = hours − 4 capped 1–5, 6 − soreness, energy; 1–5): ${parts.join('; ')}`);
    if (l) out.push(`- Latest check-in ${l.date}: ${[l.sleepHours !== undefined && `${l.sleepHours} h sleep`, l.soreness !== undefined && `soreness ${l.soreness}/5`, l.energy !== undefined && `energy ${l.energy}/5`].filter(Boolean).join(', ')} → ${num(l.score)}/5`);
  } else out.push(`- no readiness check-ins`);

  out.push(``, `## Fitness tests`);
  if (i.tests.length) for (const t of i.tests) out.push(`- ${[`${t.name}: ${t.latest ? `latest ${t.latest} (${t.latestDate}); best ${t.best}` : 'no results yet'}`, t.goal && `goal: ${t.goal}`].filter(Boolean).join('; ')}`);
  else out.push(`- no results logged`);

  out.push(``, `## Current program`);
  if (i.program) {
    const g = i.program;
    out.push(`${g.name} · version ${g.version} · ${g.status} · "${g.changeReason}"`);
    out.push(`Sessions done ${g.done}, skipped ${g.skipped}, of ${g.total}.`);
    for (const s of g.sessions) out.push(`- ${s}`);
  } else out.push(`- no active program`);

  out.push(``, `## How to answer`);
  out.push(`Suggest changes as a proposal with a reason for each. Do not assume anything not shown above; ask if something is missing.`);
  if (i.tests.some((t) => t.goal?.includes('test '))) out.push(`Where a fitness test has a date, aim the plan at it: say what each phase does for that test and how many days remain. Targets are mine; do not change them.`);
  out.push(`I approve every change in the app before it affects my training.`);
  return out.join('\n');
}
