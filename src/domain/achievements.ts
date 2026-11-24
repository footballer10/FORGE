import { convertWeight } from './units';
import type { ID, WeightUnit } from './types';

/**
 * Achievement definitions and evaluator (pure). Milestones only, no points or levels.
 * Families: workout count, hard-set count, PR count, and e1RM weight milestones on the lifts
 * the user chose for the strength score. Weekly streak achievements come with streaks.
 */

export const WORKOUT_MILESTONES = [1, 10, 25, 50, 100, 250, 500] as const;
export const SET_MILESTONES = [100, 500, 1000, 5000, 10000] as const;
export const PR_MILESTONES = [1, 10, 25, 50, 100] as const;
/** Lift e1RM milestones in lb. Keys always use lb; other units are converted before comparing. */
export const LIFT_MILESTONES_LB = [135, 225, 315, 405, 495] as const;

export interface AchievementWorkout {
  id: ID;
  /** ISO time the workout started (finished, non-trashed workouts only). */
  date: string;
  /** Completed non-warm-up sets in the workout. */
  hardSets: number;
}

export interface AchievementLift {
  exerciseId: ID;
  name: string;
  /** e1RM per workout in `unit`, any order. */
  points: readonly { date: string; workoutId: ID; e1rm: number }[];
}

export interface AchievementInput {
  workouts: readonly AchievementWorkout[];
  /** PR events (any kind), one entry each. */
  prs: readonly { date: string; workoutId: ID }[];
  lifts: readonly AchievementLift[];
  unit: WeightUnit;
}

export interface EarnedAchievement {
  key: string;
  title: string;
  description: string;
  achievedAt: string;
  workoutId: ID;
  /** The count or weight that crossed the threshold. */
  value: number;
}

export const workoutKey = (n: number) => `workouts-${n}`;
export const setKey = (n: number) => `sets-${n}`;
export const prKey = (n: number) => `prs-${n}`;
export const liftKey = (exerciseId: ID, lb: number) => `lift-${exerciseId}-${lb}`;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Walk a time-ordered list of (date, workoutId, amount) and report when each cumulative threshold was crossed. */
function cumulative(
  steps: readonly { date: string; workoutId: ID; amount: number }[],
  thresholds: readonly number[],
  make: (n: number) => Pick<EarnedAchievement, 'key' | 'title' | 'description'>,
): EarnedAchievement[] {
  const sorted = [...steps].sort((a, b) => a.date.localeCompare(b.date));
  const out: EarnedAchievement[] = [];
  let total = 0;
  let next = 0;
  for (const s of sorted) {
    total += s.amount;
    while (next < thresholds.length && total >= (thresholds[next] as number)) {
      const n = thresholds[next] as number;
      out.push({ ...make(n), achievedAt: s.date, workoutId: s.workoutId, value: n });
      next += 1;
    }
  }
  return out;
}

/** Every achievement the data has earned so far, each dated at the workout that crossed the threshold. */
export function evaluateAchievements(input: AchievementInput): EarnedAchievement[] {
  const out: EarnedAchievement[] = [];

  out.push(
    ...cumulative(
      input.workouts.map((w) => ({ date: w.date, workoutId: w.id, amount: 1 })),
      WORKOUT_MILESTONES,
      (n) => ({
        key: workoutKey(n),
        title: n === 1 ? 'First workout' : `${n} workouts`,
        description: `Finished ${plural(n, 'workout', 'workouts')}.`,
      }),
    ),
    ...cumulative(
      input.workouts.map((w) => ({ date: w.date, workoutId: w.id, amount: w.hardSets })),
      SET_MILESTONES,
      (n) => ({ key: setKey(n), title: `${n.toLocaleString('en-US')} hard sets`, description: `Completed ${plural(n, 'working set', 'working sets')} (warm-ups excluded).` }),
    ),
    ...cumulative(
      input.prs.map((p) => ({ date: p.date, workoutId: p.workoutId, amount: 1 })),
      PR_MILESTONES,
      (n) => ({ key: prKey(n), title: n === 1 ? 'First PR' : `${n} PRs`, description: `Set ${plural(n, 'personal record', 'personal records')} (rep, e1RM or volume).` }),
    ),
  );

  for (const lift of input.lifts) {
    const pts = [...lift.points].sort((a, b) => a.date.localeCompare(b.date));
    for (const lb of LIFT_MILESTONES_LB) {
      const hit = pts.find((p) => convertWeight(p.e1rm, input.unit, 'lb') >= lb);
      if (!hit) continue;
      out.push({
        key: liftKey(lift.exerciseId, lb),
        title: `${lift.name} ${lb} lb e1RM`,
        description: `Estimated one-rep max of ${lb} lb or more on ${lift.name}.`,
        achievedAt: hit.date,
        workoutId: hit.workoutId,
        value: Math.round(convertWeight(hit.e1rm, input.unit, 'lb')),
      });
    }
  }
  return out.sort((a, b) => a.achievedAt.localeCompare(b.achievedAt) || a.key.localeCompare(b.key));
}

/** Earned achievements whose key is not stored yet. */
export function newAchievements(earned: readonly EarnedAchievement[], storedKeys: ReadonlySet<string>): EarnedAchievement[] {
  return earned.filter((a) => !storedKeys.has(a.key));
}

/** Next unmet milestone in a list, or undefined when all are met. */
export function nextMilestone(thresholds: readonly number[], current: number): number | undefined {
  return thresholds.find((t) => t > current);
}
