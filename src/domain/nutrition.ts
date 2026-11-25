/**
 * Nutrition maths (pure): day totals, averages and a maintenance-calorie estimate from intake and
 * the bodyweight trend. Every figure comes with its inputs; targets are typed by the user.
 */
import { addDays } from './calendar';
import { dailyWeights, ewmaTrend, trendChange } from './bodyweight';
import type { BodyMetric, NutritionEntry, WeightUnit } from './types';

export interface Totals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entries: number;
}

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const live = (e: NutritionEntry) => !e.deletedAt;

export function dayTotals(entries: readonly NutritionEntry[], date: string): Totals {
  const t: Totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, entries: 0 };
  for (const e of entries) {
    if (!live(e) || e.date !== date) continue;
    t.calories += e.calories;
    t.proteinG += e.proteinG ?? 0;
    t.carbsG += e.carbsG ?? 0;
    t.fatG += e.fatG ?? 0;
    t.entries += 1;
  }
  return t;
}

/** Totals for each of the `days` days ending `endDate`, oldest first. */
export function intakeByDay(entries: readonly NutritionEntry[], endDate: string, days: number): { date: string; totals: Totals }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(endDate, i - (days - 1));
    return { date, totals: dayTotals(entries, date) };
  });
}

export interface IntakeAverage {
  avgCalories: number;
  avgProteinG: number;
  /** Days in the window with at least one entry; only these are averaged. */
  loggedDays: number;
  days: number;
}

/** Average over LOGGED days only, so a day you forgot to log does not drag the average toward zero. */
export function averageIntake(entries: readonly NutritionEntry[], endDate: string, days: number): IntakeAverage | undefined {
  const logged = intakeByDay(entries, endDate, days).filter((d) => d.totals.entries > 0);
  if (logged.length === 0) return undefined;
  const n = logged.length;
  return {
    avgCalories: round(logged.reduce((s, d) => s + d.totals.calories, 0) / n),
    avgProteinG: round(logged.reduce((s, d) => s + d.totals.proteinG, 0) / n),
    loggedDays: n,
    days,
  };
}

/** Energy in a unit of body weight, the usual rule of thumb (an approximation, stated on screen). */
export const KCAL_PER_LB = 3500;
export const KCAL_PER_KG = 7700;
export const MAINTENANCE_WINDOW_DAYS = 28;
/** Shortest span of bodyweight trend that is used. */
export const MIN_SPAN_DAYS = 14;
export const MAINTENANCE_FORMULA =
  'maintenance = average daily intake − (change in bodyweight trend ÷ days) × energy per lb (3,500 kcal) or kg (7,700 kcal)';

export interface MaintenanceEstimate {
  maintenance: number;
  avgCalories: number;
  loggedDays: number;
  spanDays: number;
  fromTrend: number;
  toTrend: number;
  /** Trend change per week in the analysis unit. */
  changePerWeek: number;
  unit: WeightUnit;
  formula: string;
}

export interface MaintenanceResult {
  estimate?: MaintenanceEstimate;
  /** Why there is no estimate yet, in plain words. */
  reason?: string;
}

const spanBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/**
 * Estimate maintenance calories from the last ~4 weeks. Needs a bodyweight trend spanning at least
 * 14 days and calories logged on at least half of those days (and at least 7). Otherwise says what is missing.
 */
export function estimateMaintenance(entries: readonly NutritionEntry[], metrics: BodyMetric[], endDate: string, unit: WeightUnit): MaintenanceResult {
  const points = ewmaTrend(dailyWeights(metrics, unit).filter((d) => d.date <= endDate));
  const change = trendChange(points, MAINTENANCE_WINDOW_DAYS) ?? trendChange(points, MIN_SPAN_DAYS);
  if (!change) return { reason: `Needs weigh-ins covering at least ${MIN_SPAN_DAYS} days. Log your weight a few times a week.` };
  const span = spanBetween(change.from.date, change.to.date);
  const window = intakeByDay(entries, change.to.date, span).filter((d) => d.date > change.from.date && d.totals.entries > 0);
  const needed = Math.max(7, Math.ceil(span / 2));
  if (window.length < needed) return { reason: `Needs calories logged on at least ${needed} of the last ${span} days (you have ${window.length}).` };
  const avg = window.reduce((s, d) => s + d.totals.calories, 0) / window.length;
  const kcalPerUnit = unit === 'lb' ? KCAL_PER_LB : KCAL_PER_KG;
  const perDay = change.delta / span;
  return {
    estimate: {
      maintenance: round(avg - perDay * kcalPerUnit),
      avgCalories: round(avg),
      loggedDays: window.length,
      spanDays: span,
      fromTrend: round(change.from.trend, 1),
      toTrend: round(change.to.trend, 1),
      changePerWeek: round(perDay * 7, 2),
      unit,
      formula: MAINTENANCE_FORMULA,
    },
  };
}

export interface ProteinRange {
  lowG: number;
  highG: number;
  basis: string;
}

/** Starting range only: 1.6 to 2.2 g per kg (0.7 to 1.0 g per lb). 1.6 g/kg is where extra protein stopped adding strength-training gains in a large meta-analysis (Morton et al., 2018). */
export function proteinRange(weight: number, unit: WeightUnit): ProteinRange {
  const kg = unit === 'kg' ? weight : weight / 2.20462;
  return { lowG: round(kg * 1.6), highG: round(kg * 2.2), basis: '1.6 to 2.2 g per kg of bodyweight (Morton et al., 2018 meta-analysis)' };
}
