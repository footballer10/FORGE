import { describe, expect, it } from 'vitest';
import { streakRuns, streakSummary, weeklyResults } from './streaks';

// Local-noon timestamps avoid timezone edge cases. 2026-03-02 is a Monday.
const at = (d: string) => `${d}T12:00:00`;
const w = (id: string, d: string) => ({ id, startedAt: at(d) });

describe('weekly streaks', () => {
  it('returns nothing without workouts or a target', () => {
    expect(weeklyResults([], 3, '2026-03-10')).toEqual([]);
    expect(weeklyResults([w('a', '2026-03-02')], 0, '2026-03-10')).toEqual([]);
  });

  it('counts distinct days per Monday week and marks hits', () => {
    const ws = [w('a', '2026-03-02'), w('b', '2026-03-02'), w('c', '2026-03-04'), w('d', '2026-03-08')];
    const r = weeklyResults(ws, 3, '2026-03-08');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ weekStart: '2026-03-02', days: 3, hit: true, workoutId: 'd' });
  });

  it('fills empty weeks so gaps break runs', () => {
    const ws = [w('a', '2026-03-02'), w('b', '2026-03-16')];
    const r = weeklyResults(ws, 1, '2026-03-16');
    expect(r.map((x) => x.hit)).toEqual([true, false, true]);
    expect(streakRuns(r).map((x) => x.length)).toEqual([1, 1]);
  });

  it('current streak ignores an unfinished week but counts a hit one', () => {
    const ws = [w('a', '2026-03-02'), w('b', '2026-03-09'), w('c', '2026-03-16')];
    // today is Tuesday of week 4 with no workout yet: weeks 1-3 hit (target 1)
    let s = streakSummary(weeklyResults(ws, 1, '2026-03-24'), 1);
    expect(s).toMatchObject({ current: 3, longest: 3, thisWeekDays: 0, thisWeekHit: false });
    s = streakSummary(weeklyResults([...ws, w('d', '2026-03-23')], 1, '2026-03-24'), 1);
    expect(s).toMatchObject({ current: 4, thisWeekHit: true });
  });

  it('a missed full week resets the current streak', () => {
    const ws = [w('a', '2026-03-02'), w('b', '2026-03-09')];
    const s = streakSummary(weeklyResults(ws, 1, '2026-03-24'), 1);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
  });
});
