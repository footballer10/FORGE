import { describe, expect, it } from 'vitest';
import { dailyWeights, ewmaTrend, trendChange } from './bodyweight';
import type { BodyMetric } from './types';

const m = (date: string, value: number, unit: 'lb' | 'kg' = 'lb', extra: Partial<BodyMetric> = {}): BodyMetric => ({
  id: `${date}-${value}`, createdAt: '', updatedAt: '', date, kind: 'bodyweight', value, unit, ...extra,
});

describe('dailyWeights', () => {
  it('sorts, averages a day, converts units and skips trashed or other kinds', () => {
    const rows = [
      m('2026-01-02', 180), m('2026-01-01', 100, 'kg'), m('2026-01-02', 182),
      m('2026-01-03', 1, 'lb', { deletedAt: 'x' }), m('2026-01-03', 20, 'lb', { kind: 'waist' }),
    ];
    const d = dailyWeights(rows, 'lb');
    expect(d.map((x) => x.date)).toEqual(['2026-01-01', '2026-01-02']);
    expect(d[0]!.value).toBeCloseTo(220.462, 2);
    expect(d[1]).toMatchObject({ value: 181, count: 2 });
  });
});

describe('ewmaTrend', () => {
  it('seeds with the first weigh-in and moves α toward each next day', () => {
    const t = ewmaTrend([{ date: '2026-01-01', value: 200, count: 1 }, { date: '2026-01-02', value: 190, count: 1 }]);
    expect(t[0]!.trend).toBe(200);
    expect(t[1]!.trend).toBeCloseTo(199, 6);
  });
  it('moves further after a gap: 1 − 0.9^3', () => {
    const t = ewmaTrend([{ date: '2026-01-01', value: 200, count: 1 }, { date: '2026-01-04', value: 190, count: 1 }]);
    expect(t[1]!.trend).toBeCloseTo(200 - 10 * (1 - 0.9 ** 3), 6);
  });
  it('is empty for no data', () => expect(ewmaTrend([])).toEqual([]));
});

describe('trendChange', () => {
  const pts = ewmaTrend([
    { date: '2026-01-01', value: 200, count: 1 },
    { date: '2026-01-08', value: 196, count: 1 },
    { date: '2026-01-15', value: 194, count: 1 },
  ]);
  it('compares the latest trend with the point on or before N days earlier', () => {
    const c = trendChange(pts, 7)!;
    expect(c.from.date).toBe('2026-01-08');
    expect(c.delta).toBeCloseTo(pts[2]!.trend - pts[1]!.trend, 9);
  });
  it('is undefined with too little history', () => expect(trendChange(pts, 30)).toBeUndefined());
});
