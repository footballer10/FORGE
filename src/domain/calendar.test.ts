import { describe, expect, it } from 'vitest';
import { addDays, dayStats, heatLevel, heatmapWeeks, localDateKey, monthGrid, weekStart } from './calendar';

describe('dates', () => {
  it('uses local dates and Monday weeks', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(weekStart('2026-01-04')).toBe('2025-12-29'); // Sunday -> previous Monday
    expect(weekStart('2026-01-05')).toBe('2026-01-05');
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });
});

describe('dayStats', () => {
  it('groups workouts by local day', () => {
    const a = new Date(2026, 2, 3, 8).toISOString();
    const b = new Date(2026, 2, 3, 18).toISOString();
    const s = dayStats([{ startedAt: a, hardSets: 10 }, { startedAt: b, hardSets: 5 }]);
    expect(s.get('2026-03-03')).toEqual({ workouts: 2, hardSets: 15 });
  });
});

describe('monthGrid', () => {
  it('is Monday-first and covers the whole month', () => {
    const g = monthGrid(2026, 1); // Feb 2026 starts on Sunday
    expect(g[0]![0]!.key).toBe('2026-01-26');
    expect(g[0]![6]).toEqual({ key: '2026-02-01', inMonth: true });
    expect(g.every((r) => r.length === 7)).toBe(true);
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(28);
    expect(g[g.length - 1]![6]!.key).toBe('2026-03-01');
  });
});

describe('heat', () => {
  it('levels by share of the busiest day', () => {
    expect([0, 1, 5, 6, 10, 11, 20].map((n) => heatLevel(n, 20))).toEqual([0, 1, 1, 2, 2, 3, 4]);
    expect(heatLevel(5, 0)).toBe(0);
  });
  it('builds week columns ending this week', () => {
    const w = heatmapWeeks('2026-03-04', 3); // Wednesday
    expect(w).toHaveLength(3);
    expect(w[2]![0]).toBe('2026-03-02');
    expect(w[0]![0]).toBe('2026-02-16');
    expect(w[2]![6]).toBe('2026-03-08');
  });
});
