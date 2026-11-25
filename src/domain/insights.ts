import { addDays, weekStart } from './calendar';
import type { WeekResult } from './streaks';
import { balanceChecks, detectPlateau, type VolumeSet } from './volume';
import type { WeightUnit } from './types';

/**
 * Plain-language notes built from existing analytics. Each note is one sentence with the numbers
 * behind it; `detail` repeats the rule and inputs so nothing is a black box. Pure: no storage.
 */

export const PLATEAU_WEEKS = 6;
export const BALANCE_WEEKS = 4;
export const MAX_NOTES = 3;

export type InsightKind = 'plateau' | 'balance' | 'missed';

export interface Insight {
  /** Stable while the situation is the same; changes when it does (so a dismissed note can return later). */
  id: string;
  kind: InsightKind;
  /** One sentence with the numbers. */
  text: string;
  /** The rule and inputs. */
  detail: string;
}

export interface InsightLift {
  exerciseId: string;
  name: string;
  /** One e1RM point per workout, oldest first. */
  series: readonly { date: string; e1rm: number }[];
}

export interface InsightInput {
  today: string;
  unit: WeightUnit;
  lifts: readonly InsightLift[];
  sets: readonly VolumeSet[];
  /** Weekly results from `weeklyResults`, last entry = this week. */
  weeks: readonly WeekResult[];
  /** Planned days per week. */
  target: number;
  /** Note ids the user dismissed. */
  dismissed?: ReadonlySet<string>;
}

const n0 = (n: number) => String(Math.round(n));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function plateauNotes(i: InsightInput): Insight[] {
  const out: { note: Insight; since: string }[] = [];
  for (const l of i.lifts) {
    const p = detectPlateau(l.series, i.today, PLATEAU_WEEKS);
    if (!p.plateau || !p.since) continue;
    out.push({
      since: p.since,
      note: {
        id: `plateau:${l.exerciseId}:${p.since}`,
        kind: 'plateau',
        text: `${l.name}: no e1RM gain in ${PLATEAU_WEEKS} weeks (best ${n0(p.bestBefore)} ${i.unit} on ${p.since}, ${n0(p.bestRecent)} ${i.unit} since, ${plural(p.sessionsInWindow, 'session')}).`,
        detail: `Plateau = the best e1RM in the last ${PLATEAU_WEEKS} weeks does not beat the best before them, with at least 3 sessions in that window. Inputs: before ${n0(p.bestBefore)}, recent ${n0(p.bestRecent)}, sessions ${p.sessionsInWindow}.`,
      },
    });
  }
  return out.sort((a, b) => a.since.localeCompare(b.since)).map((o) => o.note);
}

function balanceNotes(i: InsightInput): Insight[] {
  const from = addDays(i.today, -7 * BALANCE_WEEKS + 1);
  const wk = weekStart(i.today);
  const out: Insight[] = [];
  for (const c of balanceChecks(i.sets, from, addDays(i.today, 1))) {
    if (c.status !== 'aHeavy' && c.status !== 'bHeavy') continue;
    const [hi, lo] = c.status === 'aHeavy' ? [c.a, c.b] : [c.b, c.a];
    const mult = lo.sets > 0 ? ` (${Math.round((hi.sets / lo.sets) * 10) / 10}× the ${lo.name.toLowerCase()} sets)` : '';
    const lead = c.id === 'pushPull' && c.status === 'aHeavy' ? 'Pulling volume is low: ' : `${lo.name} work is light: `;
    out.push({
      id: `balance:${c.id}:${c.status}:${wk}`,
      kind: 'balance',
      text: `${lead}${plural(lo.sets, `${lo.name.toLowerCase()} set`)} vs ${plural(hi.sets, `${hi.name.toLowerCase()} set`)} in the last ${BALANCE_WEEKS} weeks${mult}.`,
      detail: `${c.label}: ${c.rule} Counts hard sets by movement pattern over ${BALANCE_WEEKS} weeks: ${c.a.name} ${c.a.sets} (${c.a.includes}), ${c.b.name} ${c.b.sets} (${c.b.includes}).`,
    });
  }
  return out;
}

function missedNotes(i: InsightInput): Insight[] {
  if (!(i.target >= 1) || i.weeks.length < 2) return [];
  const prev = i.weeks[i.weeks.length - 2] as WeekResult;
  const before = i.weeks[i.weeks.length - 3];
  if (prev.hit) return [];
  // Still training around then; a long break is not a "missed" week.
  if (prev.days === 0 && !(before && before.days > 0)) return [];
  const thisWeek = i.weeks[i.weeks.length - 1] as WeekResult;
  return [
    {
      id: `missed:${prev.weekStart}`,
      kind: 'missed',
      text: `Last week you trained ${prev.days} of ${plural(i.target, 'planned day')}${thisWeek.days ? `; this week has ${thisWeek.days} so far` : ''}.`,
      detail: `A week (Monday to Sunday) counts when distinct training days reach the target of ${i.target}. Week of ${prev.weekStart}: ${prev.days}.`,
    },
  ];
}

/** At most `MAX_NOTES` notes, not dismissed, most useful first: missed sessions, imbalance, then the longest plateaus. */
export function buildInsights(i: InsightInput, max = MAX_NOTES): Insight[] {
  const all = [...missedNotes(i), ...balanceNotes(i), ...plateauNotes(i)];
  return all.filter((n) => !i.dismissed?.has(n.id)).slice(0, max);
}
