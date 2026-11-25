import { describe, expect, it } from 'vitest';
import { buildInsights, type InsightInput } from './insights';
import type { VolumeSet } from './volume';
import type { WeekResult } from './streaks';

const today = '2026-11-25'; // Wednesday; week starts 2026-11-23
const wk = (weekStart: string, days: number, target = 3): WeekResult => ({ weekStart, days, hit: days >= target });
const set = (day: string, pattern: VolumeSet['pattern']): VolumeSet => ({ day, primary: [], secondary: [], pattern, volume: 0 });
const base: InsightInput = { today, unit: 'lb', lifts: [], sets: [], weeks: [], target: 3 };

const flat = (best: number) => [
  { date: '2026-08-01', e1rm: best },
  { date: '2026-10-20', e1rm: best - 5 },
  { date: '2026-11-03', e1rm: best - 5 },
  { date: '2026-11-17', e1rm: best - 10 },
];

describe('insights', () => {
  it('is empty with no data', () => expect(buildInsights(base)).toEqual([]));

  it('flags a plateau with the numbers', () => {
    const [n] = buildInsights({ ...base, lifts: [{ exerciseId: 'b', name: 'Bench', series: flat(225) }] });
    expect(n?.kind).toBe('plateau');
    expect(n?.text).toContain('Bench');
    expect(n?.text).toContain('225 lb');
    expect(n?.text).toContain('3 sessions');
    expect(n?.detail).toContain('before 225');
  });

  it('does not flag a lift that is still gaining', () => {
    const series = [...flat(225), { date: '2026-11-20', e1rm: 230 }];
    expect(buildInsights({ ...base, lifts: [{ exerciseId: 'b', name: 'Bench', series }] })).toEqual([]);
  });

  it('flags low pulling volume with set counts', () => {
    const sets = [
      ...Array.from({ length: 10 }, () => set('2026-11-10', 'horizontalPush')),
      ...Array.from({ length: 4 }, () => set('2026-11-11', 'horizontalPull')),
    ];
    const [n] = buildInsights({ ...base, sets });
    expect(n?.kind).toBe('balance');
    expect(n?.text).toContain('Pulling volume is low');
    expect(n?.text).toContain('4 pull sets vs 10 push sets');
  });

  it('ignores balanced volume and sets outside 4 weeks', () => {
    const sets = [
      ...Array.from({ length: 5 }, () => set('2026-11-10', 'horizontalPush')),
      ...Array.from({ length: 5 }, () => set('2026-11-10', 'horizontalPull')),
      ...Array.from({ length: 20 }, () => set('2026-09-01', 'squat')),
    ];
    expect(buildInsights({ ...base, sets })).toEqual([]);
  });

  it('flags a missed week but not a long break or a hit week', () => {
    const weeks = [wk('2026-11-09', 3), wk('2026-11-16', 1), wk('2026-11-23', 1)];
    const [n] = buildInsights({ ...base, weeks });
    expect(n?.kind).toBe('missed');
    expect(n?.text).toBe('Last week you trained 1 of 3 planned days; this week has 1 so far.');
    expect(buildInsights({ ...base, weeks: [wk('2026-11-09', 3), wk('2026-11-16', 3), wk('2026-11-23', 0)] })).toEqual([]);
    expect(buildInsights({ ...base, weeks: [wk('2026-11-09', 0), wk('2026-11-16', 0), wk('2026-11-23', 0)] })).toEqual([]);
  });

  it('caps at 3 notes, drops dismissed ids, and puts missed first', () => {
    const lifts = ['a', 'b', 'c'].map((id) => ({ exerciseId: id, name: id, series: flat(200) }));
    const sets = Array.from({ length: 10 }, () => set('2026-11-10', 'squat'));
    const weeks = [wk('2026-11-09', 3), wk('2026-11-16', 1), wk('2026-11-23', 0)];
    const all = buildInsights({ ...base, lifts, sets, weeks });
    expect(all.map((n) => n.kind)).toEqual(['missed', 'balance', 'plateau']);
    const next = buildInsights({ ...base, lifts, sets, weeks, dismissed: new Set([all[0]!.id]) });
    expect(next.map((n) => n.kind)).toEqual(['balance', 'plateau', 'plateau']);
  });
});
