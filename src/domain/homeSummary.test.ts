import { describe, expect, it } from 'vitest';
import type { BodyMetric, SetEntry, Workout } from './types';
import { weekSummary, weightSummary } from './homeSummary';

const t = '2026-11-20T10:00:00.000Z';
const wk = (id: string, day: string, extra: Partial<Workout> = {}): Workout => ({ id, createdAt: t, updatedAt: t, name: id, kind: 'strength', startedAt: `${day}T17:00:00`, endedAt: `${day}T18:00:00`, ...extra });
const set = (workoutId: string, extra: Partial<SetEntry> = {}): SetEntry => ({ id: Math.random().toString(), createdAt: t, updatedAt: t, workoutExerciseId: 'we', workoutId, exerciseId: 'e', order: 0, type: 'working', unit: 'lb', reps: 5, weight: 100, completedAt: t, ...extra });

describe('weekSummary', () => {
  // Thursday 26 Nov 2026: the week started Monday 23 Nov.
  const today = '2026-11-26';
  const workouts = new Map([
    ['a', wk('a', '2026-11-23')],
    ['b', wk('b', '2026-11-25')],
    ['old', wk('old', '2026-11-18')],
    ['open', wk('open', '2026-11-26', { endedAt: undefined })],
    ['gone', wk('gone', '2026-11-24', { deletedAt: t })],
  ]);
  const sets = [set('a'), set('a'), set('a', { type: 'warmup' }), set('a', { completedAt: undefined }), set('b'), set('old'), set('old'), set('open'), set('gone')];
  it('counts finished sessions and hard sets since Monday, and last week for comparison', () => {
    expect(weekSummary(sets, workouts, today)).toEqual({ sessions: 2, hardSets: 3, lastWeekSets: 2 });
  });
});

describe('weightSummary', () => {
  const m = (date: string, value: number): BodyMetric => ({ id: date, createdAt: t, updatedAt: t, date, kind: 'bodyweight', value, unit: 'lb' });
  it('shows the latest weigh-in and the trend change over a week when there is one', () => {
    expect(weightSummary([], 'lb')).toBeUndefined();
    expect(weightSummary([m('2026-11-24', 176)], 'lb')).toEqual({ latest: 176, unit: 'lb' });
    const s = weightSummary([m('2026-11-10', 174), m('2026-11-17', 175), m('2026-11-24', 176)], 'lb');
    expect(s?.latest).toBe(176);
    expect(s?.weekChange).toBeGreaterThan(0);
  });
});
