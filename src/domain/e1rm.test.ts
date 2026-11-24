import { describe, expect, it } from 'vitest';
import { E1RM_FORMULAS, brzycki, epley, estimate1rm, lombardi, mayhew, oconner, wathan, weightForE1rm } from './e1rm';

describe('e1RM formulas', () => {
  it('matches hand-computed values for 100 × 5', () => {
    expect(epley(100, 5)).toBeCloseTo(116.667, 2);
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 3);
    expect(lombardi(100, 5)).toBeCloseTo(117.46, 2);
    expect(mayhew(100, 5)).toBeCloseTo(119.01, 2);
    expect(oconner(100, 5)).toBeCloseTo(112.5, 3);
    expect(wathan(100, 5)).toBeCloseTo(116.58, 2);
  });
  it('a single is its own max in every formula', () => {
    for (const f of E1RM_FORMULAS) expect(f.calc(225, 1)).toBe(225);
  });
  it('returns 0 for unusable input', () => {
    for (const f of E1RM_FORMULAS) {
      expect(f.calc(0, 5)).toBe(0);
      expect(f.calc(100, 0)).toBe(0);
    }
    expect(brzycki(100, 37)).toBe(0);
  });
  it('estimate1rm dispatches by id and every formula is monotonic in reps', () => {
    expect(estimate1rm('brzycki', 100, 5)).toBe(brzycki(100, 5));
    for (const f of E1RM_FORMULAS) expect(f.calc(100, 8)).toBeGreaterThan(f.calc(100, 3));
  });
  it('weightForE1rm inverts Epley', () => {
    expect(weightForE1rm(epley(140, 8), 8)).toBeCloseTo(140, 6);
  });
});
