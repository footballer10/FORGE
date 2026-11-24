import { describe, expect, it } from 'vitest';
import { bestByDistance, conditioningRows, formatClock, formatDistance, formatPace, pace, paceUnitFor, sessionSummaries } from './conditioning';
import type { Exercise, SetEntry, Workout } from './types';

const ex = (id: string, loadModel: Exercise['loadModel']) => ({ id, loadModel }) as Exercise;
const wk = (id: string, extra: Partial<Workout> = {}) => ({ id, name: id, startedAt: '2026-03-02T12:00:00', endedAt: '2026-03-02T13:00:00', kind: 'conditioning', ...extra }) as Workout;
const st = (id: string, o: Partial<SetEntry>) => ({ id, workoutId: 'w1', exerciseId: 'run', type: 'working', completedAt: `2026-03-02T12:0${id}:00Z`, ...o }) as SetEntry;

const exercises = new Map([['run', ex('run', 'timeDistance')], ['bench', ex('bench', 'total')]]);
const workouts = new Map([['w1', wk('w1')], ['w2', wk('w2', { startedAt: '2026-03-09T12:00:00' })], ['open', wk('open', { endedAt: undefined })], ['trash', wk('trash', { deletedAt: 'x' })]]);

describe('conditioningRows', () => {
  it('keeps completed non-warm-up time/distance sets of finished, live workouts', () => {
    const rows = conditioningRows(
      [
        st('1', { durationSec: 60 }),
        st('2', { type: 'warmup', durationSec: 60 }),
        st('3', { completedAt: undefined, durationSec: 60 }),
        st('4', { exerciseId: 'bench', durationSec: 60 }),
        st('5', { workoutId: 'open', durationSec: 60 }),
        st('6', { workoutId: 'trash', durationSec: 60 }),
        st('7', { distanceM: 100, deletedAt: 'x' }),
        st('8', {}),
      ],
      exercises,
      workouts,
    );
    expect(rows.map((r) => r.setId)).toEqual(['1']);
  });
});

describe('pace and formats', () => {
  it('computes seconds per mile and per km', () => {
    expect(pace(600, 1609.344, 'mi')).toBeCloseTo(600, 6);
    expect(pace(300, 1000, 'km')).toBe(300);
    expect(pace(undefined, 1000, 'km')).toBeUndefined();
    expect(pace(60, 0, 'km')).toBeUndefined();
  });
  it('formats clocks, pace and distance by length unit', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatPace(447, 'mi')).toBe('7:27 /mi');
    expect(formatDistance(36.576, 'in')).toBe('40 yd');
    expect(formatDistance(2414, 'in')).toBe('1.5 mi');
    expect(formatDistance(400, 'cm')).toBe('400 m');
    expect(formatDistance(5000, 'cm')).toBe('5 km');
    expect(paceUnitFor('in')).toBe('mi');
    expect(paceUnitFor('cm')).toBe('km');
  });
});

describe('sessionSummaries', () => {
  const rows = conditioningRows(
    [
      st('1', { durationSec: 70, distanceM: 400 }),
      st('2', { durationSec: 66, distanceM: 400 }),
      st('3', { durationSec: 30 }),
      st('4', { workoutId: 'w2', durationSec: 1500, distanceM: 5000 }),
    ],
    exercises,
    workouts,
  );
  it('totals per session and paces only from sets with both values', () => {
    const s = sessionSummaries(rows, workouts, 'km');
    expect(s.map((x) => x.workoutId)).toEqual(['w2', 'w1']);
    const b = s[1]!.blocks[0]!;
    expect(b.totalDurationSec).toBe(166);
    expect(b.totalDistanceM).toBe(800);
    expect(b.avgPaceSec).toBeCloseTo((136 / 800) * 1000, 6);
    expect(b.fastestPaceSec).toBeCloseTo((66 / 400) * 1000, 6);
  });
  it('best by exact distance, repeated distances first', () => {
    const best = bestByDistance(rows, 'run');
    expect(best).toEqual([
      { distanceM: 400, bestTimeSec: 66, date: '2026-03-02', count: 2 },
      { distanceM: 5000, bestTimeSec: 1500, date: '2026-03-09', count: 1 },
    ]);
  });
});
