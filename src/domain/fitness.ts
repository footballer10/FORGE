/** Fitness test maths: built-in battery, value parsing/formatting, best and change. Pure; no storage or UI. */
import type { FitnessTest, LengthUnit, TestMeasure, TestResult, TestScoring } from './types';

export type BuiltInTest = Pick<FitnessTest, 'name' | 'measure' | 'scoring' | 'description'> & { key: string };

/** Stored values: reps, seconds, metres (distance), centimetres (height), or weight in the result's own unit. */
export const BUILT_IN_TESTS: BuiltInTest[] = [
  { key: 'pullups', name: 'Pull-up max', measure: 'reps', scoring: 'higherIsBetter', description: 'Max strict pull-ups, dead hang start.' },
  { key: 'pushups', name: 'Push-up max', measure: 'reps', scoring: 'higherIsBetter', description: 'Max push-ups in one set, chest to fist or floor.' },
  { key: 'run-1.5mi', name: '1.5 mile run', measure: 'timeSec', scoring: 'lowerIsBetter', description: 'Fastest time for 1.5 miles.' },
  { key: 'dash-40yd', name: '40 yard dash', measure: 'timeSec', scoring: 'lowerIsBetter', description: 'Hand-timed or timing gates, standing start.' },
  { key: 'broad-jump', name: 'Standing broad jump', measure: 'distanceM', scoring: 'higherIsBetter', description: 'Two-foot take-off, measured to the back heel.' },
  { key: 'vertical-jump', name: 'Vertical jump', measure: 'heightCm', scoring: 'higherIsBetter', description: 'Standing reach to jump touch.' },
];
export const builtInId = (key: string) => `builtin:${key}`;

export const MEASURE_LABEL: Record<TestMeasure, string> = {
  reps: 'Reps',
  timeSec: 'Time',
  distanceM: 'Distance',
  heightCm: 'Height',
  weight: 'Weight',
};

const CM_PER_IN = 2.54;
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Time as m:ss (or m:ss.t) from seconds; under a minute as "4.85 s". */
export function formatTime(sec: number): string {
  if (sec < 60) return `${round(sec, 2)} s`;
  const m = Math.floor(sec / 60);
  const s = round(sec - m * 60, 1);
  const whole = Math.floor(s);
  const frac = round(s - whole, 1);
  return `${m}:${String(whole).padStart(2, '0')}${frac ? String(frac).slice(1) : ''}`;
}

/** Length for display from a base value (metres or centimetres), in the profile length unit. */
function lengthFromBase(measure: 'distanceM' | 'heightCm', v: number, unit: LengthUnit): { value: number; unit: string } {
  const cm = measure === 'distanceM' ? v * 100 : v;
  if (unit === 'in') return { value: round(cm / CM_PER_IN, 1), unit: 'in' };
  return { value: round(cm, 1), unit: 'cm' };
}

export function formatValue(measure: TestMeasure, value: number, lengthUnit: LengthUnit, weightUnit?: string): string {
  switch (measure) {
    case 'reps':
      return `${round(value, 0)} reps`;
    case 'timeSec':
      return formatTime(value);
    case 'weight':
      return `${round(value, 1)} ${weightUnit ?? ''}`.trim();
    default: {
      const l = lengthFromBase(measure, value, lengthUnit);
      return `${l.value} ${l.unit}`;
    }
  }
}

/** Unit label used on the input box. */
export function inputUnit(measure: TestMeasure, lengthUnit: LengthUnit, weightUnit: string): string {
  if (measure === 'reps') return 'reps';
  if (measure === 'timeSec') return 'm:ss or seconds';
  if (measure === 'weight') return weightUnit;
  return lengthUnit === 'in' ? 'in' : 'cm';
}

/** Parse what the user typed into the stored base value. Undefined when it is not a usable number. */
export function parseValue(measure: TestMeasure, text: string, lengthUnit: LengthUnit): number | undefined {
  const t = text.trim().replace(',', '.');
  if (!t) return undefined;
  if (measure === 'timeSec' && t.includes(':')) {
    const parts = t.split(':');
    if (parts.length !== 2) return undefined;
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (!Number.isInteger(m) || m < 0 || !Number.isFinite(s) || s < 0 || s >= 60) return undefined;
    const total = m * 60 + s;
    return total > 0 ? total : undefined;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (measure === 'reps') return Number.isInteger(n) ? n : undefined;
  if (measure === 'distanceM') return (lengthUnit === 'in' ? n * CM_PER_IN : n) / 100;
  if (measure === 'heightCm') return lengthUnit === 'in' ? n * CM_PER_IN : n;
  return n;
}

/** Same measure → the number to put back in the edit box. */
export function editText(measure: TestMeasure, value: number, lengthUnit: LengthUnit): string {
  if (measure === 'timeSec') return value < 60 ? String(round(value, 2)) : formatTime(value);
  if (measure === 'distanceM' || measure === 'heightCm') return String(lengthFromBase(measure, value, lengthUnit).value);
  return String(round(value, 1));
}

export const isBetter = (scoring: TestScoring, a: number, b: number): boolean => (scoring === 'higherIsBetter' ? a > b : a < b);

export interface TestSummary {
  /** Newest first (date, then creation). */
  history: TestResult[];
  latest?: TestResult;
  best?: TestResult;
  /** Latest minus the result before it, in base units. */
  changeFromPrevious?: number;
  /** True when the latest result equals the best and there is an earlier result it beats. */
  latestIsBest: boolean;
}

/** Summarise results of one test. Trashed rows are ignored; on a tie the earlier result keeps "best". */
export function summarizeTest(results: TestResult[], scoring: TestScoring): TestSummary {
  const history = results
    .filter((r) => !r.deletedAt)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const latest = history[0];
  let best: TestResult | undefined;
  for (const r of [...history].reverse()) if (!best || isBetter(scoring, r.value, best.value)) best = r;
  const prev = history[1];
  return {
    history,
    latest,
    best,
    changeFromPrevious: latest && prev ? latest.value - prev.value : undefined,
    latestIsBest: !!latest && !!best && best.id === latest.id && history.length > 1,
  };
}

/** Is a change an improvement for this test? Zero is neither. */
export const changeIsImprovement = (scoring: TestScoring, delta: number): boolean | undefined =>
  delta === 0 ? undefined : scoring === 'higherIsBetter' ? delta > 0 : delta < 0;

const dayNumber = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86_400_000;
/** Whole days from `today` to `date` (negative once the date has passed). Both are YYYY-MM-DD local day keys. */
export const daysUntil = (date: string, today: string): number => Math.round(dayNumber(date) - dayNumber(today));

export interface Countdown {
  /** Whole days until the test date; undefined when no date is set. Negative when it has passed. */
  daysLeft?: number;
  /** Target in base units; undefined when none is set. */
  target?: number;
  /** Best result so far, base units. */
  best?: number;
  /** How far the best is from the target, base units, always >= 0. 0 when met. Undefined without a target or a result. */
  gap?: number;
  met: boolean;
}

/** Best result vs the user's typed target and the days left to the test date. Formula: gap = target − best (higher is better) or best − target (lower is better). */
export function testCountdown(test: Pick<FitnessTest, 'scoring' | 'targetValue' | 'testDate'>, best: number | undefined, today: string): Countdown {
  const target = test.targetValue;
  const hasBoth = target !== undefined && best !== undefined;
  const raw = hasBoth ? (test.scoring === 'higherIsBetter' ? target - best : best - target) : undefined;
  return {
    ...(test.testDate ? { daysLeft: daysUntil(test.testDate, today) } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(best !== undefined ? { best } : {}),
    ...(raw !== undefined ? { gap: Math.max(0, raw) } : {}),
    met: raw !== undefined && raw <= 0,
  };
}

/** "in 12 days", "tomorrow", "today", "3 days ago". */
export function daysLabel(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** One line for the Coach summary and the test list; every number shown with its inputs. */
export function describeCountdown(test: Pick<FitnessTest, 'measure' | 'scoring' | 'testDate'>, c: Countdown, lengthUnit: LengthUnit, weightUnit?: string): string | undefined {
  const parts: string[] = [];
  const f = (v: number) => formatValue(test.measure, v, lengthUnit, weightUnit);
  if (c.target !== undefined) {
    parts.push(`target ${f(c.target)}`);
    if (c.gap !== undefined) parts.push(c.met ? 'target met' : `${f(c.gap)} ${test.scoring === 'higherIsBetter' ? 'to gain' : 'to cut'}`);
    else parts.push('no result yet');
  }
  if (test.testDate && c.daysLeft !== undefined) parts.push(`test ${test.testDate} (${daysLabel(c.daysLeft)})`);
  return parts.length ? parts.join(', ') : undefined;
}
