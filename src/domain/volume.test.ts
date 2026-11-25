import { describe, expect, it } from 'vitest';
import { balanceChecks, compareWindows, detectPlateau, periodWindows, totalsBetween, volumeSets, weeklyTotals, type VolumeSet } from './volume';
import type { SetEntry } from './types';

const vs = (day: string, primary: string[], secondary: string[] = [], volume = 100): VolumeSet => ({ day, primary: primary as never, secondary: secondary as never, volume });

describe('totalsBetween', () => {
  it('weights primary 1.0 and secondary 0.5, end exclusive', () => {
    const t = totalsBetween([vs('2026-05-04', ['chest'], ['triceps', 'shoulders']), vs('2026-05-05', ['chest']), vs('2026-05-11', ['chest'])], '2026-05-04', '2026-05-11');
    expect(t.byMuscle.get('chest')).toBe(2);
    expect(t.byMuscle.get('triceps')).toBe(0.5);
    expect(t.sets).toBe(2);
    expect(t.volume).toBe(200);
  });
  it('does not double count a muscle listed as primary and secondary', () => {
    expect(totalsBetween([vs('2026-05-04', ['chest'], ['chest'])], '2026-05-01', '2026-06-01').byMuscle.get('chest')).toBe(1);
  });
  it('counts sets of exercises with no muscles as unassigned', () => {
    const t = totalsBetween([vs('2026-05-04', [])], '2026-05-01', '2026-06-01');
    expect(t.unassigned).toBe(1);
    expect(t.sets).toBe(1);
  });
});

describe('weeklyTotals', () => {
  it('buckets Monday-start weeks oldest first, ending with the current week', () => {
    // 2026-05-13 is a Wednesday; week starts Monday 2026-05-11.
    const w = weeklyTotals([vs('2026-05-10', ['lats']), vs('2026-05-11', ['lats']), vs('2026-05-13', ['lats'])], '2026-05-13', 2);
    expect(w.map((x) => x.week)).toEqual(['2026-05-04', '2026-05-11']);
    expect(w.map((x) => x.totals.byMuscle.get('lats'))).toEqual([1, 2]);
  });
});

describe('periodWindows', () => {
  it('month: this month so far vs whole last month', () => {
    const w = periodWindows('2026-05-13', 'month');
    expect(w.current).toEqual({ from: '2026-05-01', to: '2026-05-14' });
    expect(w.previous).toEqual({ from: '2026-04-01', to: '2026-05-01' });
  });
  it('month across a year boundary', () => {
    expect(periodWindows('2026-01-10', 'month').previous).toEqual({ from: '2025-12-01', to: '2026-01-01' });
  });
  it('3m: adjacent windows of equal calendar length', () => {
    const w = periodWindows('2026-05-13', '3m');
    expect(w.current).toEqual({ from: '2026-02-14', to: '2026-05-14' });
    expect(w.previous).toEqual({ from: '2025-11-14', to: '2026-02-14' });
  });
  it('12m clamps short months', () => {
    const w = periodWindows('2026-03-31', '12m');
    expect(w.current.to).toBe('2026-04-01');
    expect(w.previous.to).toBe(w.current.from);
  });
});

describe('compareWindows', () => {
  it('computes deltas and percent, biggest change first', () => {
    const c = totalsBetween([vs('2026-05-05', ['chest']), vs('2026-05-06', ['chest']), vs('2026-05-07', ['lats'])], '2026-05-01', '2026-06-01');
    const p = totalsBetween([vs('2026-04-05', ['chest']), vs('2026-04-06', ['quadriceps']), vs('2026-04-07', ['quadriceps']), vs('2026-04-08', ['quadriceps'])], '2026-04-01', '2026-05-01');
    const rows = compareWindows(c, p);
    expect(rows[0]).toMatchObject({ muscle: 'quadriceps', current: 0, previous: 3, delta: -3, percent: -100 });
    expect(rows.find((r) => r.muscle === 'chest')).toMatchObject({ delta: 1, percent: 100 });
    expect(rows.find((r) => r.muscle === 'lats')?.percent).toBeUndefined();
  });
});

describe('detectPlateau', () => {
  const s = (date: string, e1rm: number) => ({ date: `${date}T12:00:00`, e1rm });
  it('flags no gain over the window with enough sessions', () => {
    const r = detectPlateau([s('2026-01-05', 200), s('2026-03-01', 195), s('2026-03-08', 198), s('2026-03-15', 200)], '2026-03-20', 4);
    expect(r).toMatchObject({ plateau: true, bestBefore: 200, bestRecent: 200, sessionsInWindow: 3 });
  });
  it('a new best inside the window is not a plateau', () => {
    expect(detectPlateau([s('2026-01-05', 200), s('2026-03-01', 195), s('2026-03-08', 205), s('2026-03-15', 200)], '2026-03-20', 4).plateau).toBe(false);
  });
  it('too few sessions (a lay-off) or no earlier history is not a plateau', () => {
    expect(detectPlateau([s('2026-01-05', 200), s('2026-03-15', 190)], '2026-03-20', 4).plateau).toBe(false);
    expect(detectPlateau([s('2026-03-01', 195), s('2026-03-08', 198), s('2026-03-15', 200)], '2026-03-20', 4).plateau).toBe(false);
  });
});

describe('volumeSets', () => {
  const base = { createdAt: '', updatedAt: '', workoutExerciseId: 'we', workoutId: 'w1', exerciseId: 'e', order: 0, unit: 'lb' as const, type: 'working' as const, completedAt: '2026-05-05T15:00:00.000Z' };
  const ex = new Map([['e', { primaryMuscles: ['chest' as const], secondaryMuscles: [], pattern: 'horizontalPush' as const, loadModel: 'total' as const }]]);
  const wk = new Map([['w1', { endedAt: 'x' }], ['w2', { endedAt: 'x', deletedAt: 'y' }], ['w3', {}]]);
  it('keeps hard sets of finished workouts and computes volume', () => {
    const rows = volumeSets(
      [{ id: '1', ...base, weight: 100, reps: 5 }, { id: '2', ...base, type: 'warmup', weight: 45, reps: 5 }, { id: '3', ...base, workoutId: 'w2', weight: 100, reps: 5 }, { id: '4', ...base, workoutId: 'w3', weight: 100, reps: 5 }, { id: '5', ...base, weight: 100, reps: 5, completedAt: undefined }] as SetEntry[],
      ex, wk, [], 'lb',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.volume).toBe(500);
  });
  it('counts a set with no reps as a hard set with volume 0', () => {
    expect(volumeSets([{ id: '1', ...base, durationSec: 30 }] as SetEntry[], ex, wk, [], 'lb')[0]!.volume).toBe(0);
  });
});

describe('balanceChecks', () => {
  const ps = (pattern: string, n: number, day = '2026-05-05'): VolumeSet[] => Array.from({ length: n }, () => ({ day, primary: [], secondary: [], pattern: pattern as never, volume: 0 }));
  it('counts sets by pattern inside the window and flags the heavy side', () => {
    const sets = [...ps('horizontalPush', 6), ...ps('verticalPush', 3), ...ps('horizontalPull', 4), ...ps('verticalPull', 2), ...ps('horizontalPush', 50, '2026-01-01')];
    const [pp] = balanceChecks(sets, '2026-05-01', '2026-06-01');
    expect(pp).toMatchObject({ a: { sets: 9 }, b: { sets: 6 }, status: 'balanced' });
    expect(pp!.ratio).toBeCloseTo(1.5, 6); // exactly the limit is not flagged
    expect(balanceChecks([...ps('horizontalPush', 10), ...ps('horizontalPull', 5)], '2026-05-01', '2026-06-01')[0]!.status).toBe('aHeavy');
  });
  it('squat side includes lunges; one-sided and empty cases', () => {
    const [, sh] = balanceChecks([...ps('squat', 3), ...ps('lunge', 1), ...ps('hinge', 8)], '2026-05-01', '2026-06-01');
    expect(sh).toMatchObject({ a: { sets: 4 }, b: { sets: 8 }, status: 'bHeavy' });
    expect(balanceChecks(ps('squat', 2), '2026-05-01', '2026-06-01')[1]).toMatchObject({ status: 'aHeavy', ratio: undefined });
    expect(balanceChecks([], '2026-05-01', '2026-06-01')[0]!.status).toBe('noData');
  });
});
