import { platesPerSide } from './plates';
import { convertWeight } from './units';
import type { EquipmentProfile, Exercise, WeightUnit } from './types';

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

// ---------------------------------------------------------------------------
// Automatic warm-up weights (fills the warm-up sets an exercise already has)
// ---------------------------------------------------------------------------

/** One ladder step: a share of the first working weight, or the empty bar. */
export interface LadderStep {
  pct: number | 'bar';
  reps: number;
}

/**
 * The rule for each number of warm-up sets, taken from how the user actually warms up
 * (squat 205: 45×8, 85×8, 115×3, 155×2, 185×1; press 75: 45×8, 55×5, 65×2; RDL 135: 95×8, 115×5).
 * Barbell ladders with 3 or more sets start with the empty bar; other equipment uses a share instead.
 */
export const WARMUP_LADDERS: Record<1 | 2 | 3 | 4 | 5, LadderStep[]> = {
  1: [{ pct: 0.6, reps: 10 }],
  2: [{ pct: 0.65, reps: 8 }, { pct: 0.85, reps: 5 }],
  3: [{ pct: 'bar', reps: 8 }, { pct: 0.7, reps: 5 }, { pct: 0.85, reps: 2 }],
  4: [{ pct: 'bar', reps: 10 }, { pct: 0.6, reps: 5 }, { pct: 0.75, reps: 3 }, { pct: 0.9, reps: 1 }],
  5: [{ pct: 'bar', reps: 8 }, { pct: 0.4, reps: 8 }, { pct: 0.55, reps: 3 }, { pct: 0.75, reps: 2 }, { pct: 0.9, reps: 1 }],
};

/** Ladder for `n` warm-up sets. Above 5: the bar, then shares spread evenly from 35% to 90%, reps falling to 1. */
export function ladderFor(n: number, barbell: boolean): LadderStep[] {
  const base: LadderStep[] =
    n >= 1 && n <= 5
      ? WARMUP_LADDERS[n as 1 | 2 | 3 | 4 | 5]
      : [{ pct: 'bar', reps: 8 }, ...Array.from({ length: Math.max(0, n - 1) }, (_, i) => ({ pct: 0.35 + (0.55 * i) / Math.max(1, n - 2), reps: Math.max(1, Math.round(8 - (7 * i) / Math.max(1, n - 2))) }))];
  // Without a bar, the "bar" step becomes 40% of the working weight.
  return barbell ? base : base.map((s) => (s.pct === 'bar' ? { ...s, pct: 0.4 } : s));
}

export type WarmupKit =
  /** Barbell: loadable weights are the bar plus pairs of plates. */
  | { kind: 'barbell'; bar: number; plates: number[]; minTol: number }
  /** Dumbbells, cables, machines: multiples of the exercise's step. */
  | { kind: 'step'; step: number; minTol: number };

/**
 * Every loadable barbell weight up to `max`, with its loading effort: one point per plate on a side,
 * plus half a point for a tiny plate (under a tenth of the biggest, e.g. 2.5 lb), so 55 (a 5 a side)
 * beats 50 (a 2.5 a side).
 */
export function loadableWeights(bar: number, plates: number[], max: number, maxPerSide = 5): Map<number, number> {
  const sizes = [...new Set(plates.filter((p) => p > 0))].sort((a, b) => b - a);
  const tiny = (sizes[0] ?? 0) / 10;
  const cost = (p: number) => (p < tiny ? 1.5 : 1);
  const out = new Map<number, number>([[bar, 0]]);
  const key = (w: number) => Math.round(w * 100) / 100;
  const walk = (start: number, side: number, count: number, effort: number) => {
    if (count >= maxPerSide) return;
    for (let i = start; i < sizes.length; i++) {
      const next = side + sizes[i]!;
      const total = key(bar + 2 * next);
      if (total > max + 1e-9) continue;
      const e = effort + cost(sizes[i]!);
      const have = out.get(total);
      if (have === undefined || e < have) out.set(total, e);
      walk(i, next, count + 1, e);
    }
  };
  walk(0, 0, 0, 0);
  return out;
}

/**
 * Warm-up weights for `n` warm-up sets before a first working weight `work` (all one unit).
 * Each step aims at its share of `work`. "Easy" wins: among weights within the tolerance
 * (the larger of `minTol` and 7.5% of `work`), the one with the fewest plates per side is chosen,
 * then the closest. Weights rise set to set and stay below `work`; when that is impossible
 * (very light working weights) a step repeats the previous weight.
 */
export function autoWarmupWeights(work: number, n: number, kit: WarmupKit): { weight: number; reps: number }[] {
  if (!(work > 0) || n <= 0) return [];
  const steps = ladderFor(n, kit.kind === 'barbell');
  const tol = Math.max(kit.minTol, work * 0.075);
  const out: { weight: number; reps: number }[] = [];
  const options: [number, number][] =
    kit.kind === 'barbell'
      ? [...loadableWeights(kit.bar, kit.plates, work).entries()].filter(([w]) => w < work)
      : Array.from({ length: Math.max(0, Math.ceil(work / kit.step) - 1) }, (_, i) => [Math.round((i + 1) * kit.step * 100) / 100, 0] as [number, number]).filter(([w]) => w < work);
  let prev = 0;
  for (const s of steps) {
    let weight: number | undefined;
    if (s.pct === 'bar' && kit.kind === 'barbell') {
      weight = kit.bar < work ? kit.bar : undefined;
    } else {
      const target = work * (s.pct === 'bar' ? 0.4 : s.pct);
      const above = options.filter(([w]) => w > prev + 1e-9);
      const near = above.filter(([w]) => Math.abs(w - target) <= tol + 1e-9);
      const pick = (list: [number, number][]) =>
        [...list].sort((a, b) => a[1] - b[1] || Math.abs(a[0] - target) - Math.abs(b[0] - target) || a[0] - b[0])[0]?.[0];
      weight = pick(near) ?? [...above].sort((a, b) => Math.abs(a[0] - target) - Math.abs(b[0] - target))[0]?.[0];
    }
    const w = weight ?? (prev || (kit.kind === 'barbell' ? Math.min(kit.bar, work) : Math.min(kit.step, work)));
    out.push({ weight: w, reps: s.reps });
    prev = Math.max(prev, w);
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const STANDARD_PLATES_LB = [45, 35, 25, 10, 5, 2.5];

/**
 * How weights can be loaded for this exercise, in `unit`. Barbell lifts with the `total` load model use
 * the bar and plates (exercise bar, else the equipment profile's, else 45 lb and a standard lb set);
 * other loaded exercises use their weight increment. Bodyweight, assisted and time/distance work has
 * no warm-up weights (undefined).
 */
export function warmupKitFor(
  ex: Pick<Exercise, 'equipment' | 'loadModel' | 'barWeight' | 'weightIncrement' | 'incrementUnit'>,
  equipment: Pick<EquipmentProfile, 'barWeight' | 'plates'> | undefined,
  unit: WeightUnit,
): WarmupKit | undefined {
  if (ex.loadModel !== 'total' && ex.loadModel !== 'perImplement') return undefined;
  const minTol = unit === 'lb' ? 5 : 2.5;
  if (ex.equipment === 'barbell' && ex.loadModel === 'total') {
    const b = ex.barWeight ?? equipment?.barWeight ?? { value: 45, unit: 'lb' as const };
    const plates = (equipment?.plates ?? STANDARD_PLATES_LB.map((value) => ({ value, unit: 'lb' as const }))).map((p) => r2(convertWeight(p.value, p.unit, unit)));
    return { kind: 'barbell', bar: r2(convertWeight(b.value, b.unit, unit)), plates, minTol };
  }
  const step = r2(convertWeight(ex.weightIncrement, ex.incrementUnit, unit));
  return step > 0 ? { kind: 'step', step, minTol } : undefined;
}

/** The rule in words, for the screen: "Warm-ups: bar, 40%, 55%, 75%, 90% of 205, easiest plates". */
export function describeLadder(n: number, barbell: boolean): string {
  return ladderFor(n, barbell).map((s) => (s.pct === 'bar' ? 'bar' : `${Math.round(s.pct * 100)}%`)).join(', ');
}
