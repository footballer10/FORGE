import { describe, expect, it } from 'vitest';
import { detectPrs, e1rmSeries, liftSets, type LiftSet } from './prs';
import { epley } from './e1rm';
import type { BodyMetric, SetEntry } from './types';

let n = 0;
const ls = (day: string, load: number, reps: number, workoutId = day): LiftSet => ({
  setId: `s${n++}`, workoutId, date: `${day}T10:00:00.000Z`, load, reps,
});

describe('e1rmSeries', () => {
  it('keeps the best estimate per workout and ignores sets over 12 reps', () => {
    const s = [ls('2026-01-01', 100, 5), ls('2026-01-01', 110, 3), ls('2026-01-01', 40, 20), ls('2026-01-08', 105, 5)];
    const out = e1rmSeries(s, 'epley');
    expect(out).toHaveLength(2);
    expect(out[0]!.e1rm).toBeCloseTo(epley(110, 3), 6);
    expect(out[0]!.load).toBe(110);
    expect(out[1]!.e1rm).toBeCloseTo(epley(105, 5), 6);
  });
});

describe('detectPrs', () => {
  const history = [
    ls('2026-01-01', 100, 5), ls('2026-01-01', 100, 5),
    ls('2026-01-08', 105, 5), // rep PR at 5, e1RM PR, volume PR? (105*5=525 < 1000) no
    ls('2026-01-15', 100, 5), ls('2026-01-15', 100, 5), ls('2026-01-15', 100, 5), // volume PR only (1500)
    ls('2026-01-22', 105, 5), // tie on rep and e1RM: no PR
  ];
  const prs = detectPrs(history, 'epley');
  it('first values are baselines, not PRs', () => {
    expect(prs.every((p) => p.date > '2026-01-01T99')).toBe(true);
  });
  it('finds rep, e1RM and volume PRs in order', () => {
    expect(prs.map((p) => [p.kind, p.date.slice(0, 10)])).toEqual([
      ['rep', '2026-01-08'],
      ['e1rm', '2026-01-08'],
      ['volume', '2026-01-15'],
    ]);
    expect(prs[0]!).toMatchObject({ reps: 5, value: 105, previous: 100 });
  });
  it('ties are not PRs', () => {
    expect(prs.some((p) => p.date.startsWith('2026-01-22'))).toBe(false);
  });
  it('the formula changes e1RM PRs', () => {
    const h = [ls('2026-02-01', 100, 5), ls('2026-02-08', 110, 1)];
    expect(detectPrs(h, 'epley').some((p) => p.kind === 'e1rm')).toBe(false); // 116.7 vs 110
    expect(detectPrs([ls('2026-02-01', 100, 5), ls('2026-02-08', 120, 1)], 'epley').some((p) => p.kind === 'e1rm')).toBe(true);
  });
});

describe('liftSets', () => {
  const base = { createdAt: '', updatedAt: '', workoutExerciseId: 'we', exerciseId: 'e', order: 0, unit: 'lb' as const };
  const set = (o: Partial<SetEntry>): SetEntry => ({ id: `x${n++}`, workoutId: 'w1', type: 'working', completedAt: '2026-03-02T10:00:00.000Z', ...base, ...o });
  const wk = new Map([['w1', {}], ['w2', { deletedAt: '2026-03-03T00:00:00Z' }]]);

  it('skips warm-ups, incomplete, trashed-workout and deleted sets', () => {
    const out = liftSets(
      [set({ weight: 100, reps: 5 }), set({ type: 'warmup', weight: 50, reps: 5 }), set({ weight: 100, reps: 5, completedAt: undefined }),
       set({ weight: 100, reps: 5, workoutId: 'w2' }), set({ weight: 100, reps: 5, deletedAt: 'x' })],
      { loadModel: 'total' }, wk, [], 'lb',
    );
    expect(out).toHaveLength(1);
  });
  it('perImplement is never doubled', () => {
    expect(liftSets([set({ weight: 50, reps: 10 })], { loadModel: 'perImplement' }, wk, [], 'lb')[0]!.load).toBe(50);
  });
  it('converts kg to the analysis unit', () => {
    expect(liftSets([set({ weight: 100, unit: 'kg', reps: 3 })], { loadModel: 'total' }, wk, [], 'lb')[0]!.load).toBeCloseTo(220.46, 1);
  });
  it('bodyweight lifts use bodyweight on the date; assisted subtracts', () => {
    const m: BodyMetric[] = [{ id: 'b', createdAt: '', updatedAt: '', date: '2026-03-01', kind: 'bodyweight', value: 180, unit: 'lb' }];
    expect(liftSets([set({ weight: 20, reps: 5 })], { loadModel: 'bodyweightPlusAdded' }, wk, m, 'lb')[0]!.load).toBe(200);
    expect(liftSets([set({ weight: 40, reps: 5 })], { loadModel: 'assisted' }, wk, m, 'lb')[0]!.load).toBe(140);
  });
  it('drops bodyweight lifts with no bodyweight known, and no-load models', () => {
    expect(liftSets([set({ weight: 20, reps: 5 })], { loadModel: 'bodyweightPlusAdded' }, wk, [], 'lb')).toHaveLength(0);
    expect(liftSets([set({ weight: 20, reps: 5 })], { loadModel: 'repsOnly' }, wk, [], 'lb')).toHaveLength(0);
  });
  it('uses the workout bodyweight snapshot when no weigh-in exists', () => {
    const w = new Map([['w1', { bodyweight: { value: 170, unit: 'lb' as const } }]]);
    expect(liftSets([set({ weight: 0, reps: 5 })], { loadModel: 'bodyweightPlusAdded' }, w, [], 'lb')[0]!.load).toBe(170);
  });
});

describe('e1RM for high-rep work', () => {
  const ls = (workoutId: string, date: string, load: number, reps: number) => ({ setId: `${workoutId}-${load}-${reps}`, workoutId, date, load, reps });
  it('gives 15-rep-only sessions a rough estimate', () => {
    const pts = e1rmSeries([ls('a', '2026-11-20T10:00:00Z', 10, 15), ls('a', '2026-11-20T10:05:00Z', 10, 15)], 'epley');
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ reps: 15, rough: true });
    expect(pts[0]!.e1rm).toBeCloseTo(15, 5); // 10 × (1 + 15/30)
  });
  it('ignores 13–20-rep sets when the session has a set of 12 or fewer', () => {
    const pts = e1rmSeries([ls('b', '2026-11-21T10:00:00Z', 100, 5), ls('b', '2026-11-21T10:05:00Z', 90, 20)], 'epley');
    expect(pts[0]).toMatchObject({ reps: 5 });
    expect(pts[0]!.rough).toBeUndefined();
  });
  it('never uses sets above 20 reps', () => {
    expect(e1rmSeries([ls('c', '2026-11-22T10:00:00Z', 50, 25)], 'epley')).toEqual([]);
  });
});

describe('rep records count for every rep count at or below what was done', () => {
  const ls = (workoutId: string, date: string, load: number, reps: number) => ({ setId: `${workoutId}-${load}x${reps}`, workoutId, date, load, reps });
  const sets = [
    ls('w1', '2026-01-01T10:00:00Z', 200, 3),
    ls('w1', '2026-01-01T10:10:00Z', 180, 7),
    ls('w2', '2026-01-08T10:00:00Z', 210, 5), // heavier 5: beats the 3-rep (and 1-2) best quietly, and is a new 5-rep best
  ];
  it('reports only the rep count actually done, and tracks 7 reps too', () => {
    const reps = detectPrs(sets, 'epley').filter((e) => e.kind === 'rep');
    expect(reps.map((e) => e.reps)).toEqual([5]);
    expect(reps[0]).toMatchObject({ value: 210, previous: 180 }); // the old 5-rep best was the 180 × 7
  });
  it('saves the lower counts as implied records, not shown as PRs', () => {
    const all = detectPrs(sets, 'epley', { includeImplied: true }).filter((e) => e.kind === 'rep');
    expect(all.filter((e) => e.implied).map((e) => e.reps)).toEqual([1, 2, 3, 4]);
  });
  it('a lighter set at fewer reps than an earlier heavier set is not a PR', () => {
    const r = detectPrs([ls('a', '2026-01-01T10:00:00Z', 225, 5), ls('b', '2026-01-08T10:00:00Z', 220, 3)], 'epley').filter((e) => e.kind === 'rep');
    expect(r).toEqual([]);
  });
});
