import { describe, expect, it } from 'vitest';
import { BUILT_IN_TESTS, changeIsImprovement, editText, formatTime, formatValue, parseValue, summarizeTest } from './fitness';
import type { TestResult } from './types';

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
  it('has the six built-ins with unique keys', () => {
    expect(BUILT_IN_TESTS).toHaveLength(6);
    expect(new Set(BUILT_IN_TESTS.map((t) => t.key)).size).toBe(6);
  });
});
