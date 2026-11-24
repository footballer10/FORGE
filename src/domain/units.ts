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
