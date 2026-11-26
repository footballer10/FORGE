import { describe, expect, it } from 'vitest';
import { autoWarmupWeights, buildWarmups, ladderFor, loadableWeights, type WarmupKit } from './warmup';

const LB = [45, 35, 25, 10, 5, 2.5];

describe('buildWarmups', () => {
  it('ramps bar, 50%, 70%, 85% with loadable weights', () => {
    const w = buildWarmups(225, 45, LB);
    expect(w.map((s) => [s.weight, s.reps])).toEqual([[45, 10], [110, 5], [155, 3], [190, 1]]);
    expect(w[1]!.perSide).toEqual([25, 5, 2.5]);
  });
  it('never exceeds the percentage and drops duplicates and steps at or above the work weight', () => {
    const w = buildWarmups(65, 45, LB);
    expect(w.map((s) => s.weight)).toEqual([45, 55]);
    expect(w.every((s) => s.weight < 65)).toBe(true);
  });
  it('returns nothing when the work weight is not above the bar', () => {
    expect(buildWarmups(45, 45, LB)).toEqual([]);
    expect(buildWarmups(40, 45, LB)).toEqual([]);
  });
  it('works in kg', () => {
    const w = buildWarmups(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25]);
    expect(w.map((s) => s.weight)).toEqual([20, 50, 70, 85]);
  });
});

describe('automatic warm-up weights (rules from the user\'s own ramps)', () => {
  const plates = [45, 35, 25, 10, 5, 2.5];
  const bar: WarmupKit = { kind: 'barbell', bar: 45, plates, minTol: 5 };
  const w = (work: number, n: number, kit: WarmupKit = bar) => autoWarmupWeights(work, n, kit).map((s) => s.weight);

  it('squat 205 with 5 warm-ups: bar, then easy loads rising to 185', () => {
    expect(w(205, 5)).toEqual([45, 95, 115, 155, 185]);
    expect(autoWarmupWeights(205, 5, bar).map((s) => s.reps)).toEqual([8, 8, 3, 2, 1]);
  });
  it('bench 110 with 4, press 75 with 3, RDL 135 with 2', () => {
    expect(w(110, 4)).toEqual([45, 65, 85, 95]);
    expect(w(75, 3)).toEqual([45, 55, 65]); // exactly what the user does
    expect(w(135, 2)).toEqual([95, 115]); // exactly what the user does
  });
  it('prefers fewer plates within the tolerance', () => {
    // 40% of 205 is 82: 95 (one 25 a side) is easier than 85 (two 10s) and close enough.
    expect(w(205, 5)[1]).toBe(95);
    // 75% of 205 is 154: 135 is easier but 19 lb away, outside 7.5% (15.4), so 155.
    expect(w(205, 5)[3]).toBe(155);
  });
  it('always rises and stays under the working weight', () => {
    for (const work of [95, 135, 185, 225, 315, 405]) {
      for (let n = 1; n <= 6; n++) {
        const ws = w(work, n);
        expect(ws).toHaveLength(n);
        for (let i = 1; i < ws.length; i++) expect(ws[i]!).toBeGreaterThanOrEqual(ws[i - 1]!);
        for (const x of ws) expect(x).toBeLessThan(work);
      }
    }
  });
  it('every barbell weight is loadable with the plates', () => {
    const loadable = loadableWeights(45, plates, 405);
    for (const x of w(315, 5)) expect(loadable.has(x)).toBe(true);
  });
  it('dumbbells and cables use their step (incline press 35 a hand: 25, 30)', () => {
    const db: WarmupKit = { kind: 'step', step: 5, minTol: 5 };
    expect(w(35, 2, db)).toEqual([25, 30]); // exactly what the user does
    expect(w(85, 1, db)).toEqual([50]); // seated row 85: 60% is 51
    expect(w(50, 3, db)[0]).toBe(20); // no bar: first step is 40%
  });
  it('handles light working weights without going over', () => {
    expect(w(50, 3)).toEqual([45, 45, 45]);
    expect(autoWarmupWeights(0, 3, bar)).toEqual([]);
  });
  it('ladders exist for 1 to 5 sets and stretch beyond', () => {
    expect(ladderFor(3, true)[0]!.pct).toBe('bar');
    expect(ladderFor(3, false)[0]!.pct).toBe(0.4);
    expect(ladderFor(7, true)).toHaveLength(7);
    expect(loadableWeights(45, [45, 25], 135).get(135)).toBe(1);
    expect(loadableWeights(45, [45, 25], 135).get(95)).toBe(1);
  });
});
