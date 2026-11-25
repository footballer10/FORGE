import { describe, expect, it } from 'vitest';
import { buildWarmups } from './warmup';

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
