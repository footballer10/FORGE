import type { Weight, WeightUnit } from './types';

/** Exact international definition: 1 lb = 0.45359237 kg. */
export const KG_PER_LB = 0.45359237;

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return from === 'lb' ? value * KG_PER_LB : value / KG_PER_LB;
}

export function toUnit(w: Weight, to: WeightUnit): Weight {
  return { value: convertWeight(w.value, w.unit, to), unit: to };
}

/** Rounds for display only: up to `decimals` places, trailing zeros removed. */
export function roundForDisplay(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function formatWeight(w: Weight, displayUnit: WeightUnit = w.unit, decimals = 1): string {
  const v = roundForDisplay(convertWeight(w.value, w.unit, displayUnit), decimals);
  return `${v} ${displayUnit}`;
}

export const METRES_PER_YARD = 0.9144;
export type DistanceUnit = 'yd' | 'm';

/** Set distances are typed in yards for an inch/mile profile, metres otherwise. Stored in metres. */
export const distanceUnitFor = (lengthUnit: 'in' | 'cm'): DistanceUnit => (lengthUnit === 'in' ? 'yd' : 'm');
export const metresTo = (m: number, unit: DistanceUnit): number => (unit === 'yd' ? m / METRES_PER_YARD : m);
export const toMetres = (v: number, unit: DistanceUnit): number => (unit === 'yd' ? v * METRES_PER_YARD : v);
