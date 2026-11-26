import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS, triageOpenWorkouts } from './openWorkouts';

const now = Date.parse('2026-11-26T18:00:00Z');
const h = 60 * 60 * 1000;

describe('triageOpenWorkouts', () => {
  it('resumes a workout used recently', () => {
    expect(triageOpenWorkouts([{ id: 'a', lastActivityMs: now - 20 * 60 * 1000, completedSets: 3 }], now)).toEqual({ resume: 'a', close: [] });
  });
  it('asks about one left idle for more than 3 hours instead of opening it', () => {
    expect(triageOpenWorkouts([{ id: 'a', lastActivityMs: now - STALE_AFTER_MS - 1, completedSets: 0 }], now)).toEqual({ ask: 'a', close: [] });
  });
  it('closes older extra open workouts: finished if they have sets, discarded if empty', () => {
    const t = triageOpenWorkouts([
      { id: 'old-empty', lastActivityMs: now - 48 * h, completedSets: 0 },
      { id: 'current', lastActivityMs: now - 1 * h, completedSets: 4 },
      { id: 'old-sets', lastActivityMs: now - 24 * h, completedSets: 6 },
    ], now);
    expect(t.resume).toBe('current');
    expect(t.close).toEqual([
      { id: 'old-sets', action: 'finish', endedAtMs: now - 24 * h },
      { id: 'old-empty', action: 'discard', endedAtMs: now - 48 * h },
    ]);
  });
  it('does nothing without open workouts', () => {
    expect(triageOpenWorkouts([], now)).toEqual({ close: [] });
  });
});
