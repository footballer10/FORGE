import { describe, expect, it } from 'vitest';
import { checkInFor, readinessScore, readinessTrend, sleepPoints } from './readiness';
import type { ReadinessCheckIn } from './types';

const c = (date: string, x: Partial<ReadinessCheckIn>, updatedAt = `${date}T08:00:00Z`): ReadinessCheckIn => ({
  id: `${date}-${updatedAt}`, date, createdAt: updatedAt, updatedAt, ...x,
});

describe('readiness', () => {
  it('scores sleep, soreness and energy on 1–5', () => {
    expect(sleepPoints(3)).toBe(1);
    expect(sleepPoints(7.5)).toBe(3.5);
    expect(sleepPoints(11)).toBe(5);
    expect(readinessScore({ sleepHours: 8, soreness: 2, energy: 4 })).toEqual({ score: 4, sleepPts: 4, freshness: 4, energy: 4 });
    expect(readinessScore({ energy: 2 })?.score).toBe(2);
    expect(readinessScore({})).toBeUndefined();
  });

  it('uses the latest check-in of a day and ignores deleted ones', () => {
    const list = [c('2026-11-20', { energy: 2 }, '2026-11-20T07:00:00Z'), c('2026-11-20', { energy: 5 }, '2026-11-20T09:00:00Z'), c('2026-11-21', { energy: 1, deletedAt: 'x' })];
    expect(checkInFor(list, '2026-11-20')?.energy).toBe(5);
    expect(checkInFor(list, '2026-11-21')).toBeUndefined();
  });

  it('builds a trend with 7-day and window averages', () => {
    const list = [
      c('2026-10-01', { energy: 1 }), // outside 28 days
      c('2026-11-01', { energy: 2, sleepHours: 6 }),
      c('2026-11-22', { energy: 4, sleepHours: 8 }),
      c('2026-11-26', { energy: 5, sleepHours: 9 }),
    ];
    const t = readinessTrend(list, '2026-11-26');
    expect(t.points.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-22', '2026-11-26']);
    expect(t.avg7).toBe(4.5);
    expect(t.avgWindow).toBe(3.7);
    expect(t.avgSleepHours).toBe(7.7);
  });
});
