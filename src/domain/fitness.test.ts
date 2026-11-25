import { describe, expect, it } from 'vitest';
import { BATTERIES, BUILT_IN_TESTS, batterySummary, changeIsImprovement, splitBattery, daysLabel, daysUntil, describeCountdown, editText, formatTime, formatValue, parseValue, summarizeTest, testCountdown } from './fitness';
import type { FitnessTest, TestResult } from './types';

const r = (id: string, date: string, value: number, extra: Partial<TestResult> = {}): TestResult => ({
  id, createdAt: id, updatedAt: id, testId: 't', date, value, ...extra,
});

describe('time', () => {
  it('formats seconds and minutes', () => {
    expect(formatTime(4.85)).toBe('4.85 s');
    expect(formatTime(612)).toBe('10:12');
    expect(formatTime(612.5)).toBe('10:12.5');
    expect(formatTime(60)).toBe('1:00');
  });
  it('parses m:ss and plain seconds', () => {
    expect(parseValue('timeSec', '10:12', 'in')).toBe(612);
    expect(parseValue('timeSec', '4.85', 'in')).toBe(4.85);
    expect(parseValue('timeSec', '10:75', 'in')).toBeUndefined();
    expect(parseValue('timeSec', '1:2:3', 'in')).toBeUndefined();
  });
});

describe('lengths', () => {
  it('converts inches to the stored base and back', () => {
    const cm = parseValue('heightCm', '30', 'in')!;
    expect(cm).toBeCloseTo(76.2, 6);
    expect(formatValue('heightCm', cm, 'in')).toBe('30 in');
    expect(formatValue('heightCm', cm, 'cm')).toBe('76.2 cm');
    const m = parseValue('distanceM', '100', 'in')!;
    expect(m).toBeCloseTo(2.54, 6);
    expect(formatValue('distanceM', m, 'in')).toBe('100 in');
    expect(editText('distanceM', m, 'in')).toBe('100');
  });
  it('takes cm as is', () => expect(parseValue('distanceM', '250', 'cm')).toBe(2.5));
});

describe('parseValue', () => {
  it('rejects empty, zero, negative and fractional reps', () => {
    for (const t of ['', '0', '-3', 'abc']) expect(parseValue('reps', t, 'in')).toBeUndefined();
    expect(parseValue('reps', '12.5', 'in')).toBeUndefined();
    expect(parseValue('reps', '12', 'in')).toBe(12);
    expect(parseValue('weight', '225,5', 'in')).toBe(225.5);
  });
});

describe('summarizeTest', () => {
  it('finds best by scoring and the change from the previous result', () => {
    const rows = [r('a', '2026-01-01', 10), r('b', '2026-02-01', 14), r('c', '2026-03-01', 12)];
    const hi = summarizeTest(rows, 'higherIsBetter');
    expect(hi.latest!.id).toBe('c');
    expect(hi.best!.id).toBe('b');
    expect(hi.changeFromPrevious).toBe(-2);
    expect(hi.latestIsBest).toBe(false);
    const lo = summarizeTest(rows, 'lowerIsBetter');
    expect(lo.best!.id).toBe('a');
  });
  it('ties keep the earlier best; trashed rows are ignored; one result is not a PR', () => {
    const s = summarizeTest([r('a', '2026-01-01', 10), r('b', '2026-02-01', 10), r('x', '2026-03-01', 99, { deletedAt: 'z' })], 'higherIsBetter');
    expect(s.best!.id).toBe('a');
    expect(s.latestIsBest).toBe(false);
    expect(summarizeTest([r('a', '2026-01-01', 5)], 'higherIsBetter').latestIsBest).toBe(false);
    expect(summarizeTest([r('a', '2026-01-01', 5), r('b', '2026-02-01', 6)], 'higherIsBetter').latestIsBest).toBe(true);
  });
  it('is empty for no results', () => expect(summarizeTest([], 'higherIsBetter').latest).toBeUndefined());
});

describe('misc', () => {
  it('improvement direction depends on scoring', () => {
    expect(changeIsImprovement('lowerIsBetter', -5)).toBe(true);
    expect(changeIsImprovement('higherIsBetter', -1)).toBe(false);
    expect(changeIsImprovement('higherIsBetter', 0)).toBeUndefined();
  });
  it('has the eight built-ins with unique keys', () => {
    expect(BUILT_IN_TESTS).toHaveLength(8);
    expect(new Set(BUILT_IN_TESTS.map((t) => t.key)).size).toBe(8);
  });
});

describe('test countdown', () => {
  const hi = { scoring: 'higherIsBetter' as const, targetValue: 15, testDate: '2026-12-20' };
  const lo = { measure: 'timeSec' as const, scoring: 'lowerIsBetter' as const, targetValue: 600, testDate: '2026-12-20' };
  it('counts days, past and future', () => {
    expect(daysUntil('2026-12-20', '2026-11-25')).toBe(25);
    expect(daysUntil('2026-11-25', '2026-11-25')).toBe(0);
    expect(daysUntil('2026-11-20', '2026-11-25')).toBe(-5);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
  });
  it('gap for higher-is-better', () => {
    expect(testCountdown(hi, 12, '2026-11-25')).toMatchObject({ gap: 3, met: false, daysLeft: 25 });
    expect(testCountdown(hi, 15, '2026-11-25')).toMatchObject({ gap: 0, met: true });
    expect(testCountdown(hi, 18, '2026-11-25')).toMatchObject({ gap: 0, met: true });
  });
  it('gap for lower-is-better', () => {
    expect(testCountdown(lo, 650, '2026-11-25')).toMatchObject({ gap: 50, met: false });
    expect(testCountdown(lo, 600, '2026-11-25').met).toBe(true);
  });
  it('no result or no goal', () => {
    expect(testCountdown(hi, undefined, '2026-11-25')).toMatchObject({ met: false, target: 15 });
    expect(testCountdown(hi, undefined, '2026-11-25').gap).toBeUndefined();
    const c = testCountdown({ scoring: 'higherIsBetter' }, 10, '2026-11-25');
    expect(c.daysLeft).toBeUndefined();
    expect(c.target).toBeUndefined();
  });
  it('describes with inputs', () => {
    const t = { measure: 'reps' as const, scoring: 'higherIsBetter' as const, testDate: '2026-12-20' };
    expect(describeCountdown(t, testCountdown({ ...hi }, 12, '2026-11-25'), 'in')).toBe('target 15 reps, 3 reps to gain, test 2026-12-20 (in 25 days)');
    const r = { measure: 'timeSec' as const, scoring: 'lowerIsBetter' as const, testDate: '2026-12-20' };
    expect(describeCountdown(r, testCountdown(lo, 650, '2026-11-25'), 'in')).toBe('target 10:00, 50 s to cut, test 2026-12-20 (in 25 days)');
    expect(describeCountdown(t, testCountdown({ ...hi }, 15, '2026-12-20'), 'in')).toContain('target met');
    expect(describeCountdown(t, testCountdown({ scoring: 'higherIsBetter' }, 1, '2026-11-25'), 'in')).toBeUndefined();
  });
  it('labels days', () => {
    expect([0, 1, -1, 5, -5].map(daysLabel)).toEqual(['today', 'tomorrow', 'yesterday', 'in 5 days', '5 days ago']);
  });
});

describe('academy battery', () => {
  const t = '2026-11-24T10:00:00.000Z';
  const test = (key: string, extra: Partial<FitnessTest> = {}): FitnessTest => ({ id: `builtin:${key}`, createdAt: t, updatedAt: t, name: key, measure: 'reps', scoring: 'higherIsBetter', builtIn: true, ...extra });
  const result = (key: string, value: number): TestResult => ({ id: `${key}-${value}`, createdAt: t, updatedAt: t, testId: `builtin:${key}`, date: '2026-11-01', value });
  const usafa = BATTERIES.find((b) => b.id === 'usafa')!;

  it('includes the six USAFA events as built-in tests', () => {
    expect(usafa.events.map((e) => e.key)).toEqual(['pullups', 'broad-jump', 'situps', 'pushups', 'run-600yd', 'run-1.5mi']);
    for (const e of usafa.events) expect(BUILT_IN_TESTS.some((b) => b.key === e.key)).toBe(true);
    expect(usafa.events.filter((e) => e.group === 'PFT')).toHaveLength(5);
  });
  it('puts battery tests first in battery order and the rest after', () => {
    const tests = [test('vertical-jump'), test('pushups'), test('pullups'), test('custom-x', { id: 'custom-x', builtIn: false })];
    const { inBattery, others } = splitBattery(usafa, tests);
    expect(inBattery.map((x) => x.test.id)).toEqual(['builtin:pullups', 'builtin:pushups']);
    expect(others.map((x) => x.id)).toEqual(['builtin:vertical-jump', 'custom-x']);
  });
  it('summarises only once a target or date is typed', () => {
    const tests = [test('pullups'), test('pushups')];
    expect(batterySummary(usafa, tests, [], '2026-11-24')).toBeUndefined();
    const withGoals = [test('pullups', { targetValue: 12, testDate: '2026-12-10' }), test('pushups', { targetValue: 50 })];
    const s = batterySummary(usafa, withGoals, [result('pullups', 12), result('pushups', 30)], '2026-11-24');
    expect(s).toMatchObject({ withTarget: 2, atTarget: 1, nextDate: '2026-12-10', daysLeft: 16 });
  });
  it('ignores a test date that has passed', () => {
    const s = batterySummary(usafa, [test('pullups', { targetValue: 12, testDate: '2026-10-01' })], [], '2026-11-24');
    expect(s?.nextDate).toBeUndefined();
  });
});
