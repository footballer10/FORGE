import { describe, expect, it } from 'vitest';
import { STANDARD_TEMPLATES, recentBestE1rm, strengthScore, templateForPattern, tierFor, validThresholds } from './strengthScore';

const sq = STANDARD_TEMPLATES[0]!.thresholds;
const bn = STANDARD_TEMPLATES[1]!.thresholds;

describe('tierFor', () => {
  it('picks the highest tier met and the next target', () => {
    expect(tierFor(1.3, sq)).toEqual({ tier: 'novice', next: { tier: 'intermediate', ratio: 1.75 } });
    expect(tierFor(1.25, sq).tier).toBe('novice'); // threshold is inclusive
  });
  it('below beginner has no tier; elite has no next', () => {
    expect(tierFor(0.5, sq)).toEqual({ tier: undefined, next: { tier: 'beginner', ratio: 0.75 } });
    expect(tierFor(3, sq)).toEqual({ tier: 'elite', next: undefined });
  });
});

describe('validThresholds', () => {
  it('requires positive, non-decreasing values', () => {
    expect(validThresholds(sq)).toBe(true);
    expect(validThresholds({ ...sq, novice: 0.5 })).toBe(false);
    expect(validThresholds({ ...sq, beginner: 0 })).toBe(false);
  });
});

describe('strengthScore', () => {
  it('is 100 × the weighted mean of e1RM ÷ bodyweight', () => {
    const r = strengthScore(
      [
        { exerciseId: 'a', name: 'Squat', weight: 2, e1rm: 300, standard: sq },
        { exerciseId: 'b', name: 'Bench', weight: 1, e1rm: 200, standard: bn },
      ],
      200,
    );
    // ratios 1.5 and 1.0 -> (2*1.5 + 1*1.0) / 3 = 1.3333 -> 133.3
    expect(r.score).toBeCloseTo(133.33, 1);
    expect(r.coverage).toBe(1);
    expect(r.lifts[0]).toMatchObject({ ratio: 1.5, tier: 'novice' });
    expect(r.lifts[0]!.toNext).toBeCloseTo(50, 6); // 1.75 × 200 − 300
    expect(r.lifts[1]).toMatchObject({ ratio: 1, tier: 'novice' });
  });
  it('leaves out lifts with no e1RM and reports coverage', () => {
    const r = strengthScore([{ exerciseId: 'a', name: 'Squat', weight: 1, e1rm: 300 }, { exerciseId: 'b', name: 'Bench', weight: 3 }], 200);
    expect(r.score).toBeCloseTo(150, 6);
    expect(r.coverage).toBeCloseTo(0.25, 6);
  });
  it('has no score without bodyweight or data', () => {
    expect(strengthScore([{ exerciseId: 'a', name: 'Squat', weight: 1, e1rm: 300 }], undefined).score).toBeUndefined();
    expect(strengthScore([{ exerciseId: 'a', name: 'Squat', weight: 1 }], 200).score).toBeUndefined();
    expect(strengthScore([], 200)).toMatchObject({ score: undefined, coverage: 0 });
  });
});

describe('recentBestE1rm', () => {
  const s = [{ date: '2026-01-01T10:00:00Z', e1rm: 300 }, { date: '2026-05-01T10:00:00Z', e1rm: 250 }, { date: '2026-05-10T10:00:00Z', e1rm: 260 }];
  it('only looks inside the window', () => {
    expect(recentBestE1rm(s, '2026-05-15')).toBe(260);
    expect(recentBestE1rm(s, '2026-09-01')).toBeUndefined();
  });
});

describe('templateForPattern', () => {
  it('maps patterns to templates', () => {
    expect(templateForPattern('hinge').id).toBe('deadlift');
    expect(templateForPattern('verticalPull').id).toBe('row');
  });
});
