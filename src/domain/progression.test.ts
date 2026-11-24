import { describe, expect, it } from 'vitest';
import { epley, weightForE1rm } from './e1rm';
import { roundToIncrement, suggestProgression, type LastSet } from './progression';

const w = (weight: number, reps: number, o: Partial<LastSet> = {}): LastSet => ({ type: 'working', unit: 'lb', weight, reps, ...o });
const inc5 = { value: 5, unit: 'lb' as const };

describe('epley', () => {
  it('matches the formula and inverts', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 5)).toBeCloseTo(116.667, 2);
    expect(epley(0, 5)).toBe(0);
    expect(weightForE1rm(epley(200, 8), 8)).toBeCloseTo(200, 6);
    expect(weightForE1rm(150, 1)).toBe(150);
  });
});

describe('roundToIncrement', () => {
  it('rounds to the nearest step', () => {
    expect(roundToIncrement(137.4, 5)).toBe(135);
    expect(roundToIncrement(137.6, 5)).toBe(140);
    expect(roundToIncrement(61.3, 2.5)).toBe(62.5);
    expect(roundToIncrement(61.3, 0)).toBe(61.3);
  });
});

describe('double progression', () => {
  const rule = { kind: 'doubleProgression' as const, repsMin: 8, repsMax: 12 };
  it('adds weight and resets reps when every set hit the top', () => {
    const s = suggestProgression({ rule, last: [w(135, 12), w(135, 12), w(135, 12)], increment: inc5 })!;
    expect(s).toMatchObject({ weight: 140, reps: 8, change: 'increase', summary: '140 lb × 8' });
    expect(s.reason).toContain('All 3 sets');
  });
  it('holds the weight and aims one rep above the lowest set otherwise', () => {
    expect(suggestProgression({ rule, last: [w(135, 12), w(135, 10), w(135, 9)], increment: inc5 })).toMatchObject({ weight: 135, reps: 10, change: 'hold' });
  });
  it('never aims below the range and ignores warm-ups and lighter drop sets', () => {
    const s = suggestProgression({ rule, last: [{ ...w(95, 5), type: 'warmup' }, w(135, 6), { ...w(100, 20), type: 'drop' }], increment: inc5 })!;
    expect(s).toMatchObject({ weight: 135, reps: 8 });
  });
  it('uses the rule increment, converted to the set unit', () => {
    const s = suggestProgression({ rule: { ...rule, increment: { value: 2.5, unit: 'kg' } }, last: [w(100, 12, { unit: 'kg' })], increment: inc5 })!;
    expect(s).toMatchObject({ weight: 102.5, unit: 'kg' });
  });
});

describe('percent e1RM', () => {
  it('rounds percent of the best Epley estimate and shows the inputs', () => {
    const s = suggestProgression({ rule: { kind: 'percentE1rm', percent: 0.8 }, last: [w(185, 5), w(175, 5)], increment: inc5 })!;
    // e1RM = 185 * (1 + 5/30) = 215.83; 80% = 172.67 -> 175
    expect(s.weight).toBe(175);
    expect(s.change).toBe('estimate');
    expect(s.reason).toContain('215.83');
    expect(s.reason).toContain('80%');
  });
});

describe('RPE target', () => {
  const rule = { kind: 'rpeTarget' as const, rpe: 8 };
  it('adjusts for reps in reserve', () => {
    // 200 x 5 @ RPE 9 = 6 reps to failure -> e1RM 240; 5 reps @ RPE 8 = 7 to failure -> 240/(1+7/30) = 194.6 -> 195
    const s = suggestProgression({ rule, targetReps: 5, last: [w(200, 5, { rpe: 9 })], increment: inc5 })!;
    expect(s).toMatchObject({ weight: 195, reps: 5, change: 'estimate' });
    expect(s.reason).toContain('RPE 9');
  });
  it('defaults to the best set reps and needs an RPE', () => {
    expect(suggestProgression({ rule, last: [w(200, 5, { rpe: 8 })], increment: inc5 })).toMatchObject({ weight: 200, reps: 5 });
    expect(suggestProgression({ rule, last: [w(200, 5)], increment: inc5 })).toBeUndefined();
  });
});

describe('no suggestion', () => {
  it('for rule none or no usable history', () => {
    expect(suggestProgression({ rule: { kind: 'none' }, last: [w(100, 5)], increment: inc5 })).toBeUndefined();
    expect(suggestProgression({ rule: { kind: 'percentE1rm', percent: 0.7 }, last: [], increment: inc5 })).toBeUndefined();
    expect(suggestProgression({ rule: { kind: 'percentE1rm', percent: 0.7 }, last: [{ type: 'warmup', unit: 'lb', weight: 50, reps: 5 }], increment: inc5 })).toBeUndefined();
  });
});
