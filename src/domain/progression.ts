import { epley, weightForE1rm } from './e1rm';
import { convertWeight } from './units';
import type { ProgressionRule, SetEntry, SetType, Weight, WeightUnit } from './types';

export type LastSet = Pick<SetEntry, 'type' | 'weight' | 'reps' | 'rpe' | 'unit'>;

export interface Suggestion {
  weight: number;
  unit: WeightUnit;
  /** Rep target the suggestion implies, when the rule sets one (double progression). */
  reps?: number;
  change: 'increase' | 'hold' | 'estimate';
  /** Short result, e.g. "140 lb × 8". */
  summary: string;
  /** Formula and inputs, always shown to the user. */
  reason: string;
}

const WORK: SetType[] = ['working', 'amrap', 'failure'];
const num = (n: number) => String(Math.round(n * 100) / 100);
const fmt = (w: number, u: WeightUnit) => `${num(w)} ${u}`;

/** Nearest multiple of `inc` (2-decimal clean); unchanged when inc is not positive. */
export function roundToIncrement(value: number, inc: number): number {
  return inc > 0 ? Math.round((Math.round(value / inc) * inc) * 100) / 100 : value;
}

const isWork = (s: LastSet): s is LastSet & { weight: number; reps: number } =>
  WORK.includes(s.type) && s.weight !== undefined && s.weight > 0 && s.reps !== undefined && s.reps > 0;

export interface SuggestInput {
  rule: ProgressionRule;
  /** Rep target of the set being planned (low end), used by RPE targets. */
  targetReps?: number;
  /** Completed sets of the last session of this exercise. */
  last: readonly LastSet[];
  /** Exercise increment (also the rounding step). */
  increment: Weight;
}

/**
 * Suggested working weight for the next session, with the formula and inputs spelled out.
 * Returns undefined when the rule is 'none' or the last session has nothing usable.
 *
 * - doubleProgression: at the heaviest weight used, if every set reached repsMax add the increment
 *   and go back to repsMin; otherwise keep the weight and aim one rep above the lowest set.
 * - percentE1rm: round(e1RM × percent), e1RM = best Epley of the last session.
 * - rpeTarget: each set's e1RM is Epley at (reps + 10 − RPE) reps; the best one gives the weight for
 *   (target reps + 10 − target RPE) reps. Sets without RPE are ignored.
 */
export function suggestProgression({ rule, targetReps, last, increment }: SuggestInput): Suggestion | undefined {
  const sets = last.filter(isWork);
  if (rule.kind === 'none' || sets.length === 0) return undefined;
  const top = sets.reduce((a, b) => (convertWeight(b.weight, b.unit, a.unit) > a.weight ? b : a));
  const unit = top.unit;
  const baseInc = rule.kind === 'doubleProgression' && rule.increment ? rule.increment : increment;
  const inc = convertWeight(baseInc.value, baseInc.unit, unit);
  const inUnit = (s: LastSet & { weight: number }) => convertWeight(s.weight, s.unit, unit);

  switch (rule.kind) {
    case 'doubleProgression': {
      const atTop = sets.filter((s) => Math.abs(inUnit(s) - top.weight) < 0.01);
      const lowest = Math.min(...atTop.map((s) => s.reps));
      const range = `${rule.repsMin}–${rule.repsMax}`;
      if (lowest >= rule.repsMax) {
        const weight = roundToIncrement(top.weight + inc, inc);
        return {
          weight, unit, reps: rule.repsMin, change: 'increase',
          summary: `${fmt(weight, unit)} × ${rule.repsMin}`,
          reason: `All ${atTop.length} set${atTop.length > 1 ? 's' : ''} at ${fmt(top.weight, unit)} reached ${rule.repsMax} (top of ${range}): + ${fmt(inc, unit)} = ${fmt(weight, unit)}, back to ${rule.repsMin} reps.`,
        };
      }
      const reps = Math.min(rule.repsMax, Math.max(rule.repsMin, lowest + 1));
      return {
        weight: top.weight, unit, reps, change: 'hold',
        summary: `${fmt(top.weight, unit)} × ${reps}`,
        reason: `Lowest set at ${fmt(top.weight, unit)} was ${lowest} reps, below the top of ${range}: keep the weight, aim for ${reps}.`,
      };
    }
    case 'percentE1rm': {
      const best = sets.reduce((a, b) => (epley(inUnit(b), b.reps) > epley(inUnit(a), a.reps) ? b : a));
      const e1rm = epley(inUnit(best), best.reps);
      const weight = roundToIncrement(e1rm * rule.percent, inc);
      return {
        weight, unit, change: 'estimate',
        summary: fmt(weight, unit),
        reason: `e1RM ${num(e1rm)} ${unit} (Epley: ${num(inUnit(best))} × (1 + ${best.reps}/30)) × ${num(rule.percent * 100)}% = ${num(e1rm * rule.percent)}, rounded to ${num(inc)}.`,
      };
    }
    case 'rpeTarget': {
      const withRpe = sets.filter((s) => s.rpe !== undefined);
      if (withRpe.length === 0) return undefined;
      const est = (s: LastSet & { weight: number; reps: number }) => epley(inUnit(s), s.reps + (10 - (s.rpe as number)));
      const best = withRpe.reduce((a, b) => (est(b) > est(a) ? b : a));
      const e1rm = est(best);
      const reps = targetReps ?? best.reps;
      const effective = reps + (10 - rule.rpe);
      const weight = roundToIncrement(weightForE1rm(e1rm, effective), inc);
      return {
        weight, unit, reps, change: 'estimate',
        summary: `${fmt(weight, unit)} × ${reps}`,
        reason: `Best set ${num(inUnit(best))} × ${best.reps} @ RPE ${num(best.rpe as number)} = ${num(best.reps + 10 - (best.rpe as number))} reps to failure, e1RM ${num(e1rm)} ${unit}. For ${reps} reps @ RPE ${num(rule.rpe)} (${num(effective)} to failure): ${num(e1rm)} ÷ (1 + ${num(effective)}/30), rounded to ${num(inc)}.`,
      };
    }
  }
}
