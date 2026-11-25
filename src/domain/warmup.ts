import { platesPerSide } from './plates';

export interface WarmupSet {
  weight: number;
  reps: number;
  /** Plates for one side that make this weight (empty for the bar alone). */
  perSide: number[];
}

/** Share of the first working weight and the reps for each step after the empty bar. */
export const WARMUP_STEPS: readonly { pct: number; reps: number }[] = [
  { pct: 0.5, reps: 5 },
  { pct: 0.7, reps: 3 },
  { pct: 0.85, reps: 1 },
];

/**
 * Warm-up ramp for a barbell lift: the empty bar × 10, then 50% × 5, 70% × 3, 85% × 1 of the first
 * working weight. Each weight is the heaviest the plates can make without going over the
 * percentage, so every set is loadable. Steps at or below the bar, equal to an earlier step, or at
 * or above the working weight are dropped. Returns [] when the working weight is not above the bar.
 * All values share one unit.
 */
export function buildWarmups(workWeight: number, bar: number, plates: number[]): WarmupSet[] {
  if (!(workWeight > bar) || !(bar > 0)) return [];
  const out: WarmupSet[] = [{ weight: bar, reps: 10, perSide: [] }];
  for (const { pct, reps } of WARMUP_STEPS) {
    const r = platesPerSide(workWeight * pct, bar, plates);
    const prev = out[out.length - 1]!;
    if (r.loaded > prev.weight && r.loaded < workWeight) out.push({ weight: r.loaded, reps, perSide: r.perSide });
  }
  return out;
}
