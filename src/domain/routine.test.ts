import { describe, expect, it } from 'vitest';
import { describeTargets, draftsFromTargets, reindex, sanitizeExercises, targetsFromSets } from './routine';
import type { RoutineExercise } from './types';

describe('draftsFromTargets', () => {
  it('uses the target weight, else the last session by position, else empty', () => {
    const last = [
      { type: 'warmup' as const, weight: 95, unit: 'lb' as const },
      { type: 'working' as const, weight: 135, unit: 'lb' as const },
      { type: 'working' as const, weight: 140, unit: 'lb' as const },
    ];
    const d = draftsFromTargets(
      [{ type: 'warmup', reps: 5 }, { type: 'working', reps: 6, repsMax: 8 }, { type: 'working', reps: 6, weight: 150, unit: 'kg' }, { type: 'working', reps: 6 }],
      last,
      'lb',
    );
    expect(d[0]).toEqual({ type: 'warmup', unit: 'lb', weight: 95, reps: 5 });
    expect(d[1]).toEqual({ type: 'working', unit: 'lb', weight: 135, reps: 6 });
    expect(d[2]).toEqual({ type: 'working', unit: 'kg', weight: 150, reps: 6 });
    expect(d[3]).toEqual({ type: 'working', unit: 'lb', reps: 6 }); // history exhausted
  });
  it('gives one empty working set when there are no targets', () => {
    expect(draftsFromTargets([], [], 'kg')).toEqual([{ type: 'working', unit: 'kg', reps: 8 }]);
  });
});

describe('describeTargets', () => {
  it('groups identical consecutive targets and shows ranges and RPE', () => {
    expect(describeTargets([{ type: 'working', reps: 5 }, { type: 'working', reps: 5 }, { type: 'working', reps: 6, repsMax: 8, rpe: 8 }])).toBe('2 × 5 · 6–8 · RPE 8');
    expect(describeTargets([{ type: 'amrap', reps: 5, weight: 100, unit: 'lb' }])).toBe('AMRAP 5 @ 100lb');
    expect(describeTargets([])).toBe('No targets');
  });
});

describe('sanitizeExercises', () => {
  const ex = (o: Partial<RoutineExercise>): RoutineExercise => ({ exerciseId: 'a', order: 9, targets: [], ...o });
  it('reindexes, clamps ranges and RPE, drops lone superset groups', () => {
    const out = sanitizeExercises([
      ex({ supersetGroup: 'A', targets: [{ type: 'working', reps: 8, repsMax: 5, rpe: 11 }] }),
      ex({ exerciseId: 'b', supersetGroup: 'B', restSec: 90.4 }),
      ex({ exerciseId: 'c', supersetGroup: 'B' }),
    ]);
    expect(out.map((e) => e.order)).toEqual([0, 1, 2]);
    expect(out[0]?.supersetGroup).toBeUndefined();
    expect(out[0]?.targets[0]).toEqual({ type: 'working', reps: 8 });
    expect(out[1]).toMatchObject({ supersetGroup: 'B', restSec: 90 });
  });
  it('reindex keeps array order', () => {
    expect(reindex([ex({ exerciseId: 'x' }), ex({ exerciseId: 'y' })]).map((e) => e.order)).toEqual([0, 1]);
  });
});

describe('targetsFromSets', () => {
  it('keeps completed sets only', () => {
    const t = targetsFromSets([
      { type: 'working', weight: 100, unit: 'lb', reps: 5, completedAt: 'x' },
      { type: 'working', weight: 100, unit: 'lb', reps: 5 },
    ]);
    expect(t).toEqual([{ type: 'working', reps: 5, weight: 100, unit: 'lb' }]);
  });
});

describe('applySuggestion', () => {
  const s = { weight: 140, unit: 'lb' as const, reps: 8, change: 'increase' as const, summary: '', reason: '' };
  it('sets weight and reps on working sets without a fixed weight; leaves warm-ups', async () => {
    const { applySuggestion } = await import('./routine');
    const targets = [{ type: 'warmup' as const, reps: 5 }, { type: 'working' as const, reps: 12 }, { type: 'working' as const, reps: 12, weight: 150, unit: 'kg' as const }];
    const drafts = [{ type: 'warmup' as const, unit: 'lb' as const, reps: 5 }, { type: 'working' as const, unit: 'lb' as const, reps: 12 }, { type: 'working' as const, unit: 'kg' as const, weight: 150, reps: 12 }];
    expect(applySuggestion(drafts, targets, s)).toEqual([
      drafts[0],
      { type: 'working', unit: 'lb', weight: 140, reps: 8 },
      { type: 'working', unit: 'kg', weight: 150, reps: 8 },
    ]);
  });
  it('keeps reps when the suggestion has none', async () => {
    const { applySuggestion } = await import('./routine');
    const { reps: _r, ...noReps } = s;
    const out = applySuggestion([{ type: 'working' as const, unit: 'lb' as const, reps: 5 }], [{ type: 'working', reps: 5 }], noReps);
    expect(out[0]).toEqual({ type: 'working', unit: 'lb', weight: 140, reps: 5 });
  });
});
