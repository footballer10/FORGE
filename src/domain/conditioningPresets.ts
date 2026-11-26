/**
 * One-tap conditioning sessions for a rugby back and the Air Force Academy tests. Distances are exact
 * (yards and miles converted to metres); rests are per set. Times are logged by the user.
 */
export const METRES_PER_YARD = 0.9144;
export const METRES_PER_MILE = 1609.344;

export type ConditioningExerciseName = 'Sprint' | 'Run';

export interface ConditioningPreset {
  id: string;
  name: string;
  detail: string;
  exercise: ConditioningExerciseName;
  count: number;
  distanceM: number;
  /** Rest after each effort, seconds (0 = no timer). */
  restSec: number;
}

const r = (m: number) => Math.round(m * 1000) / 1000;

export const CONDITIONING_PRESETS: ConditioningPreset[] = [
  { id: 'sprints-40yd', name: 'Sprints', detail: '8 × 40 yd, 90 s rest', exercise: 'Sprint', count: 8, distanceM: r(40 * METRES_PER_YARD), restSec: 90 },
  { id: 'tempo-100m', name: 'Tempo runs', detail: '10 × 100 m, 45 s rest', exercise: 'Run', count: 10, distanceM: 100, restSec: 45 },
  { id: 'intervals-400m', name: 'Intervals', detail: '6 × 400 m, 90 s rest', exercise: 'Run', count: 6, distanceM: 400, restSec: 90 },
  { id: 'pft-600yd', name: '600-yard run', detail: 'PFT event: 2 efforts, 4 min rest', exercise: 'Run', count: 2, distanceM: r(600 * METRES_PER_YARD), restSec: 240 },
  { id: 'aft-1.5mi', name: '1.5-mile run', detail: 'AFT practice: one timed effort', exercise: 'Run', count: 1, distanceM: r(1.5 * METRES_PER_MILE), restSec: 0 },
];
