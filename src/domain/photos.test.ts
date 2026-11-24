import { describe, expect, it } from 'vitest';
import { daysBetween, fitWithin, poseLabel, sortPhotos } from './photos';

describe('fitWithin', () => {
  it('shrinks the longest edge to the limit and keeps the ratio', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it('never enlarges', () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
});

describe('sortPhotos', () => {
  it('sorts newest first and drops trashed', () => {
    const p = (id: string, date: string, createdAt = id, deletedAt?: string) => ({ id, date, createdAt, ...(deletedAt ? { deletedAt } : {}) });
    expect(sortPhotos([p('a', '2026-01-01'), p('b', '2026-02-01'), p('c', '2026-02-01', 'z'), p('d', '2026-03-01', 'd', 'x')]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('misc', () => {
  it('counts days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(daysBetween('2026-03-01', '2026-01-01')).toBe(-59);
  });
  it('labels poses', () => {
    expect(poseLabel('side')).toBe('Side');
    expect(poseLabel(undefined)).toBe('Unlabelled');
  });
});
