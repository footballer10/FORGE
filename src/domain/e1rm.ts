import type { E1rmFormula } from './types';

/**
 * Estimated one-rep max formulas. A single (reps = 1) is its own max in every formula.
 * Estimates get unreliable above ~12 reps; callers decide the cap (see `E1RM_MAX_REPS`).
 */

/** Sets above this many reps are not used for e1RM (formulas drift). */
export const E1RM_MAX_REPS = 12;

export interface E1rmFormulaInfo {
  id: E1rmFormula;
  name: string;
  /** Human-readable formula, shown next to every chart and PR. */
  formula: string;
  calc: (weight: number, reps: number) => number;
}

const valid = (w: number, r: number) => w > 0 && r >= 1;

/** Epley: e1RM = weight × (1 + reps / 30); a single is its own max. 0 for no weight or reps. */
export function epley(weight: number, reps: number): number {
  if (!valid(weight, reps)) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function brzycki(weight: number, reps: number): number {
  if (!valid(weight, reps) || reps >= 37) return 0;
  return reps === 1 ? weight : (weight * 36) / (37 - reps);
}

export function lombardi(weight: number, reps: number): number {
  if (!valid(weight, reps)) return 0;
  return reps === 1 ? weight : weight * Math.pow(reps, 0.1);
}

export function mayhew(weight: number, reps: number): number {
  if (!valid(weight, reps)) return 0;
  return reps === 1 ? weight : (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * reps));
}

export function oconner(weight: number, reps: number): number {
  if (!valid(weight, reps)) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 40);
}

export function wathan(weight: number, reps: number): number {
  if (!valid(weight, reps)) return 0;
  return reps === 1 ? weight : (100 * weight) / (48.8 + 53.8 * Math.exp(-0.075 * reps));
}

export const E1RM_FORMULAS: readonly E1rmFormulaInfo[] = [
  { id: 'epley', name: 'Epley', formula: 'weight × (1 + reps / 30)', calc: epley },
  { id: 'brzycki', name: 'Brzycki', formula: 'weight × 36 / (37 − reps)', calc: brzycki },
  { id: 'lombardi', name: 'Lombardi', formula: 'weight × reps^0.10', calc: lombardi },
  { id: 'mayhew', name: 'Mayhew', formula: '100 × weight / (52.2 + 41.9 × e^(−0.055 × reps))', calc: mayhew },
  { id: 'oconner', name: "O'Conner", formula: 'weight × (1 + reps / 40)', calc: oconner },
  { id: 'wathan', name: 'Wathan', formula: '100 × weight / (48.8 + 53.8 × e^(−0.075 × reps))', calc: wathan },
];

export function formulaInfo(id: E1rmFormula): E1rmFormulaInfo {
  return E1RM_FORMULAS.find((f) => f.id === id) ?? E1RM_FORMULAS[0];
}

/** e1RM with the chosen formula. 0 when weight or reps are unusable. */
export function estimate1rm(formula: E1rmFormula, weight: number, reps: number): number {
  return formulaInfo(formula).calc(weight, reps);
}

/** Inverse of Epley: the weight that gives `e1rm` at `reps`. */
export function weightForE1rm(e1rm: number, reps: number): number {
  if (!(e1rm > 0) || !(reps >= 1)) return 0;
  return reps === 1 ? e1rm : e1rm / (1 + reps / 30);
}
