import { describe, expect, it } from 'vitest';
import type { SetEntry } from './types';
import { bestWorkingSet, collapsedSummary, currentExerciseId, foldWarmups, setProgress } from './workoutView';

const done = '2026-11-25T10:00:00.000Z';
const s = (p: Partial<SetEntry>): SetEntry => ({ id: 'x', createdAt: done, updatedAt: done, workoutExerciseId: 'we', workoutId: 'w', exerciseId: 'e', order: 0, type: 'working', unit: 'lb', ...p });

describe('currentExerciseId', () => {
  it('is the first exercise with an unfinished or missing set', () => {
    expect(currentExerciseId([{ id: 'a', sets: [{ completedAt: done }] }, { id: 'b', sets: [{ completedAt: done }, {}] }, { id: 'c', sets: [] }])).toBe('b');
    expect(currentExerciseId([{ id: 'a', sets: [{ completedAt: done }] }, { id: 'c', sets: [] }])).toBe('c');
  });
  it('is undefined when everything is done', () => {
    expect(currentExerciseId([{ id: 'a', sets: [{ completedAt: done }] }])).toBeUndefined();
    expect(currentExerciseId([])).toBeUndefined();
  });
});

describe('setProgress and summary', () => {
  const sets = [s({ type: 'warmup', weight: 95, reps: 5, completedAt: done }), s({ weight: 205, reps: 5, completedAt: done }), s({ weight: 225, reps: 3, completedAt: done }), s({ weight: 225, reps: 3 })];
  it('counts working sets apart from warm-ups', () => {
    expect(setProgress(sets)).toEqual({ doneWorking: 2, totalWorking: 3, warmups: 1, warmupsDone: 1 });
  });
  it('picks the heaviest completed working set, never a warm-up or unticked set', () => {
    expect(bestWorkingSet(sets)?.weight).toBe(225);
    expect(bestWorkingSet([s({ type: 'warmup', weight: 300, completedAt: done })])).toBeUndefined();
  });
  it('breaks weight ties by reps', () => {
    expect(bestWorkingSet([s({ weight: 100, reps: 5, completedAt: done }), s({ weight: 100, reps: 8, completedAt: done })])?.reps).toBe(8);
  });
  it('summarises for a collapsed card', () => {
    expect(collapsedSummary(sets, 'total', 'lb')).toBe('2/3 sets · 225 lb × 3');
    expect(collapsedSummary([s({})], 'total', 'lb')).toBe('0/1 sets');
    expect(collapsedSummary([s({ type: 'warmup', completedAt: done }), s({ type: 'warmup' })], 'total', 'lb')).toBe('1/2 warm-up');
  });
});

describe('foldWarmups', () => {
  it('folds only when all warm-ups are done and the user has not opened them', () => {
    const w = [s({ type: 'warmup', completedAt: done }), s({ type: 'warmup', completedAt: done })];
    expect(foldWarmups(w, false)).toBe(true);
    expect(foldWarmups(w, true)).toBe(false);
    expect(foldWarmups([...w, s({ type: 'warmup' })], false)).toBe(false);
    expect(foldWarmups([s({})], false)).toBe(false);
  });
});
