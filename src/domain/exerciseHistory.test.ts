import { describe, expect, it } from 'vitest';
import { exerciseHistory, inRange, recentPrBadges, repRecords } from './exerciseHistory';
import type { LiftSet, PrEvent } from './prs';
import type { SetEntry } from './types';

const lift = (setId: string, workoutId: string, date: string, load: number, reps: number): LiftSet => ({ setId, workoutId, date, load, reps });

describe('repRecords', () => {
  it('takes the heaviest load at exactly each rep count, earliest on a tie', () => {
    const r = repRecords([
      lift('a', 'w1', '2026-01-01T10:00:00Z', 100, 5),
      lift('b', 'w2', '2026-02-01T10:00:00Z', 110, 5),
      lift('c', 'w3', '2026-03-01T10:00:00Z', 110, 5),
      lift('d', 'w1', '2026-01-01T10:00:00Z', 140, 1),
      lift('e', 'w1', '2026-01-01T10:00:00Z', 90, 6),
    ]);
    expect(r).toEqual([
      { reps: 1, load: 140, date: '2026-01-01T10:00:00Z' },
      { reps: 5, load: 110, date: '2026-02-01T10:00:00Z' },
    ]);
  });
});

const set = (id: string, workoutId: string, order: number, type: SetEntry['type'], weight: number, reps: number, at: string | undefined): SetEntry =>
  ({ id, workoutId, workoutExerciseId: 'we', exerciseId: 'x', order, type, weight, unit: 'lb', reps, ...(at ? { completedAt: at } : {}), createdAt: at ?? '', updatedAt: at ?? '' }) as SetEntry;

describe('exerciseHistory', () => {
  it('lists working sets newest workout first, counts warm-ups, sums volume, skips unticked and trashed', () => {
    const sets = [
      set('w', 'A', 0, 'warmup', 45, 10, '2026-01-01T10:00:00Z'),
      set('s1', 'A', 1, 'working', 100, 5, '2026-01-01T10:05:00Z'),
      set('s2', 'A', 2, 'working', 100, 5, '2026-01-01T10:10:00Z'),
      set('u', 'A', 3, 'working', 100, 5, undefined),
      set('s3', 'B', 0, 'working', 110, 3, '2026-01-08T10:00:00Z'),
      set('t', 'C', 0, 'working', 200, 1, '2026-01-09T10:00:00Z'),
    ];
    const lifts = [lift('s1', 'A', '', 100, 5), lift('s2', 'A', '', 100, 5), lift('s3', 'B', '', 110, 3)];
    const h = exerciseHistory(sets, lifts, (id) => id !== 'C');
    expect(h.map((w) => w.workoutId)).toEqual(['B', 'A']);
    expect(h[1]).toMatchObject({ warmups: 1, volume: 1000 });
    expect(h[1]!.working).toHaveLength(2);
    expect(h[0]!.volume).toBe(330);
  });
});

describe('inRange', () => {
  const pts = [{ date: '2026-01-01T12:00:00' }, { date: '2026-10-20T12:00:00' }, { date: '2026-11-20T12:00:00' }];
  it('filters by days before today and keeps all for All', () => {
    expect(inRange(pts, '1m', '2026-11-25')).toHaveLength(1);
    expect(inRange(pts, '3m', '2026-11-25')).toHaveLength(2);
    expect(inRange(pts, 'all', '2026-11-25')).toHaveLength(3);
  });
});

describe('recentPrBadges', () => {
  const pr = (kind: PrEvent['kind'], date: string, reps?: number): PrEvent => ({ kind, date, workoutId: 'w', value: 2, previous: 1, ...(reps ? { reps } : {}) });
  it('keeps recent PRs, one per kind and rep count, newest first, capped', () => {
    const b = recentPrBadges(
      [pr('rep', '2026-11-01T12:00:00', 5), pr('rep', '2026-11-20T12:00:00', 5), pr('e1rm', '2026-11-20T12:00:00'), pr('volume', '2026-06-01T12:00:00'), pr('rep', '2026-11-10T12:00:00', 3)],
      '2026-11-25',
    );
    expect(b.map((x) => x.label)).toEqual(['5-rep PR', 'e1RM PR', '3-rep PR']);
    expect(recentPrBadges([pr('rep', '2026-11-20T12:00:00', 5), pr('e1rm', '2026-11-20T12:00:00')], '2026-11-25', 30, 1)).toHaveLength(1);
  });
});
