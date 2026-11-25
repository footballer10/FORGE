import { describe, expect, it } from 'vitest';
import { canComplete, durationMinutes, fieldsFor, formatSet, prefillDrafts, suggestionTarget } from './logging';

describe('logging', () => {
  it('chooses fields by load model', () => {
    expect(fieldsFor('total')).toEqual(['weight', 'reps']);
    expect(fieldsFor('perImplement')).toEqual(['weight', 'reps']);
    expect(fieldsFor('assisted')).toEqual(['weight', 'reps']);
    expect(fieldsFor('repsOnly')).toEqual(['reps']);
    expect(fieldsFor('timeDistance')).toEqual(['durationSec', 'distanceM']);
  });
  it('prefills from last session, or one empty set', () => {
    expect(prefillDrafts([])).toEqual([{ type: 'working' }]);
    expect(prefillDrafts([
      { type: 'warmup', weight: 135, reps: 5 },
      { type: 'working', weight: 205, reps: 5 },
    ])).toEqual([
      { type: 'warmup', weight: 135, reps: 5 },
      { type: 'working', weight: 205, reps: 5 },
    ]);
  });
  it('needs reps (or time/distance) to complete', () => {
    expect(canComplete({}, 'total')).toBe(false);
    expect(canComplete({ reps: 0 }, 'total')).toBe(false);
    expect(canComplete({ reps: 5 }, 'total')).toBe(true);
    expect(canComplete({}, 'timeDistance')).toBe(false);
    expect(canComplete({ durationSec: 30 }, 'timeDistance')).toBe(true);
  });
  it('formats sets', () => {
    expect(formatSet({ type: 'working', weight: 102.5, reps: 5 }, 'total', 'lb')).toBe('102.5 lb × 5');
    expect(formatSet({ type: 'working', reps: 8 }, 'repsOnly', 'lb')).toBe('× 8');
    expect(formatSet({ type: 'working', durationSec: 90, distanceM: 400 }, 'timeDistance', 'lb')).toBe('1:30 · 400 m');
  });
  it('computes minutes', () => {
    expect(durationMinutes('2026-11-24T10:00:00.000Z', '2026-11-24T10:52:20.000Z')).toBe(52);
  });
});

describe('suggestionTarget', () => {
  it('skips warm-ups and finished sets', () => {
    const sets = [{ type: 'warmup' as const }, { type: 'working' as const, completedAt: 'x' }, { type: 'working' as const, id: 'n' }, { type: 'working' as const }];
    expect(suggestionTarget(sets)).toBe(sets[2]);
    expect(suggestionTarget([{ type: 'warmup' as const }])).toBeUndefined();
  });
});
