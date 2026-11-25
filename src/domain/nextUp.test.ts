import { describe, expect, it } from 'vitest';
import { pickNextUp, summarizeSets } from './nextUp';
import type { ProgramTree } from './program';
import type { Routine } from './types';

const ex = [{ exerciseId: 'e1', order: 0, targets: [] }];
const tree = (status: 'active' | 'draft', done: boolean, updatedAt = '2026-01-01'): ProgramTree =>
  ({
    program: { id: 'p', name: 'Block', status, updatedAt },
    weeks: [{ id: 'w', weekNumber: 2, sessions: [{ id: 's1', name: 'Push', exercises: ex, ...(done ? { completedWorkoutId: 'x' } : {}) }, { id: 's2', name: 'Pull', exercises: ex, skipped: done }] }],
  }) as unknown as ProgramTree;
const routine = { id: 'r', name: 'Legs', exercises: ex } as unknown as Routine;

describe('pickNextUp', () => {
  it('uses the first open session of the active program', () => {
    const n = pickNextUp({ trees: [tree('active', false)], routines: [], workouts: [] });
    expect(n).toMatchObject({ kind: 'program', id: 's1', name: 'Push', source: 'Block · Week 2' });
  });
  it('ignores non-active programs and finished programs, then falls back to the last routine', () => {
    const workouts = [{ routineId: 'r', startedAt: '2026-02-01', endedAt: '2026-02-01' }];
    expect(pickNextUp({ trees: [tree('draft', false), tree('active', true)], routines: [routine], workouts })).toMatchObject({ kind: 'routine', id: 'r' });
  });
  it('returns nothing without a program or a still-existing routine', () => {
    const workouts = [{ routineId: 'gone', startedAt: '2026-02-01', endedAt: '2026-02-01' }];
    expect(pickNextUp({ trees: [], routines: [routine], workouts })).toBeUndefined();
  });
});

describe('summarizeSets', () => {
  it('same reps and weight', () => {
    expect(summarizeSets([{ type: 'working', weight: 140, reps: 8, unit: 'lb' }, { type: 'working', weight: 140, reps: 8, unit: 'lb' }, { type: 'warmup', weight: 45, reps: 5, unit: 'lb' }])).toBe('2 × 8 @ 140 lb');
  });
  it('mixed weights and no weight', () => {
    expect(summarizeSets([{ type: 'working', weight: 100, reps: 8, unit: 'kg' }, { type: 'working', weight: 110, reps: 6, unit: 'kg' }])).toBe('2 sets @ up to 110 kg');
    expect(summarizeSets([{ type: 'working', reps: 10, unit: 'lb' }])).toBe('1 × 10');
  });
});
