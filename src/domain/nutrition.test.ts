import { describe, expect, it } from 'vitest';
import type { BodyMetric, NutritionEntry } from './types';
import { averageIntake, dayTotals, estimateMaintenance, intakeByDay, proteinRange } from './nutrition';

const t = '2026-11-24T10:00:00.000Z';
const food = (date: string, calories: number, extra: Partial<NutritionEntry> = {}): NutritionEntry => ({ id: `${date}-${calories}-${Math.random()}`, createdAt: t, updatedAt: t, date, calories, ...extra });
const weigh = (date: string, value: number): BodyMetric => ({ id: date, createdAt: t, updatedAt: t, date, kind: 'bodyweight', value, unit: 'lb' });

describe('day totals and averages', () => {
  const entries = [food('2026-11-24', 600, { proteinG: 40 }), food('2026-11-24', 900, { proteinG: 60, carbsG: 100, fatG: 20 }), food('2026-11-23', 2000, { proteinG: 150 }), food('2026-11-22', 1000, { deletedAt: t })];
  it('sums a day, skipping missing macros and trashed entries', () => {
    expect(dayTotals(entries, '2026-11-24')).toEqual({ calories: 1500, proteinG: 100, carbsG: 100, fatG: 20, entries: 2 });
    expect(dayTotals(entries, '2026-11-22').entries).toBe(0);
  });
  it('lists the window oldest first', () => {
    expect(intakeByDay(entries, '2026-11-24', 3).map((d) => d.date)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
  });
  it('averages logged days only', () => {
    expect(averageIntake(entries, '2026-11-24', 7)).toEqual({ avgCalories: 1750, avgProteinG: 125, loggedDays: 2, days: 7 });
    expect(averageIntake([], '2026-11-24', 7)).toBeUndefined();
  });
});

describe('estimateMaintenance', () => {
  const end = '2026-11-28';
  const dates = Array.from({ length: 29 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 10, 28 - (28 - i)));
    return d.toISOString().slice(0, 10);
  });
  const flatWeights = dates.map((d) => weigh(d, 180));
  const eatEvery = (kcal: number) => dates.map((d) => food(d, kcal));

  it('is intake when weight is flat', () => {
    const r = estimateMaintenance(eatEvery(2800), flatWeights, end, 'lb');
    expect(r.estimate?.maintenance).toBe(2800);
    expect(r.estimate?.changePerWeek).toBe(0);
  });
  it('subtracts a surplus that is gaining weight', () => {
    // trend rises about 0.1 lb/day: 0.1 × 3500 = 350 kcal/day of surplus
    const rising = dates.map((d, i) => weigh(d, 180 + i * 0.1));
    const r = estimateMaintenance(eatEvery(3000), rising, end, 'lb');
    expect(r.estimate).toBeDefined();
    expect(r.estimate!.maintenance).toBeLessThan(2800);
    expect(r.estimate!.maintenance).toBeGreaterThan(2500);
    expect(r.estimate!.changePerWeek).toBeGreaterThan(0.4);
  });
  it('explains what is missing', () => {
    expect(estimateMaintenance(eatEvery(2800), [weigh(end, 180)], end, 'lb').reason).toMatch(/weigh-ins covering/);
    const sparse = dates.slice(0, 3).map((d) => food(d, 2500));
    expect(estimateMaintenance(sparse, flatWeights, end, 'lb').reason).toMatch(/logged on at least/);
  });
  it('uses 7,700 kcal per kg', () => {
    const kg = dates.map((d, i) => ({ ...weigh(d, 80 + i * 0.05), unit: 'kg' as const }));
    const r = estimateMaintenance(eatEvery(3000), kg, end, 'kg');
    expect(r.estimate!.unit).toBe('kg');
    expect(r.estimate!.maintenance).toBeLessThan(2800);
  });
});

describe('proteinRange', () => {
  it('is 1.6 to 2.2 g per kg', () => {
    expect(proteinRange(100, 'kg')).toMatchObject({ lowG: 160, highG: 220 });
    expect(proteinRange(176, 'lb').lowG).toBeCloseTo(128, 0);
  });
});
