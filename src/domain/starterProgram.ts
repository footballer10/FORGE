/**
 * The user's own A / B / C Day program, built from their Strong templates (screenshots, 2026-11-25).
 * Exercises, set structure and every rest timer are exactly as in Strong. Weights come from the last
 * performed session (what the "Previous" column showed), converted to ONE dumbbell where Strong shows a
 * pair total. Working-set weights are left out wherever the last session is the right starting point, so
 * each set prefills from history; the squat has fixed weights because A Day (heavy, 6s) and C Day
 * (volume, 8s) use different loads and would otherwise take each other's. Warm-up weights are fixed so the
 * ramp is always complete. Shown to the user through the normal review-and-approve step.
 */
import type { Proposal, ProposalExercise, ProposalSession, ProposalSet } from './programProposal';
import { SCHEMA_VERSION } from './programProposal';

/** A warm-up set with its rest after it, in seconds. Weight left out = use the last warm-up. */
const warm = (weight: number | undefined, reps: number, restSec: number): ProposalSet => ({ type: 'warmup', reps, restSec, ...(weight !== undefined ? { weight } : {}) });
/** `count` working sets with the same rest after each. */
const work = (count: number, reps: number, restSec: number, weight?: number): ProposalSet => ({ count, reps, restSec, ...(weight !== undefined ? { weight } : {}) });
const ex = (exercise: string, sets: ProposalSet[], notes?: string): ProposalExercise => ({ exercise, sets, ...(notes ? { notes } : {}) });

const NOTE_DB = 'Weights are per dumbbell (Strong shows the pair total).';

export const A_DAY: ProposalSession = {
  name: 'A Day',
  exercises: [
    ex('Barbell Squat', [warm(45, 8, 60), warm(85, 8, 60), warm(115, 3, 90), warm(155, 2, 90), warm(185, 1, 120), work(3, 6, 180, 205)]),
    ex('Barbell Bench Press - Medium Grip', [warm(65, 10, 60), warm(75, 5, 60), warm(85, 3, 90), warm(105, 1, 120), work(3, 8, 150)]),
    ex('Dumbbell Incline Row', [warm(45, 10, 60), work(3, 10, 90)], NOTE_DB),
    ex('Leg Extensions', [work(2, 12, 60)]),
    ex('Dumbbell Raise', [work(2, 15, 60)], `Lateral Raise (Dumbbell) in Strong. ${NOTE_DB}`),
    ex('Triceps Pushdown', [work(2, 12, 60)]),
  ],
};

export const B_DAY: ProposalSession = {
  name: 'B Day',
  exercises: [
    ex('Barbell Deadlift', [warm(65, 8, 60), warm(95, 5, 60), warm(135, 3, 90), warm(155, 2, 90), warm(185, 1, 120), work(3, 5, 180)]),
    ex('Barbell Shoulder Press', [warm(45, 8, 60), warm(55, 5, 60), warm(65, 2, 90), work(3, 8, 120)]),
    ex('Close-Grip Front Lat Pulldown', [warm(50, 10, 60), work(3, 10, 90)]),
    ex('Suspended Split Squat', [warm(undefined, 8, 60), work(3, 10, 90)], 'Bulgarian Split Squat in Strong.'),
    ex('Seated Leg Curl', [work(2, 12, 60)]),
    ex('Dumbbell Bicep Curl', [work(2, 12, 60)], NOTE_DB),
    ex('Hanging Leg Raise', [work(3, 12, 60)]),
  ],
};

export const C_DAY: ProposalSession = {
  name: 'C Day',
  exercises: [
    ex('Barbell Squat', [warm(45, 8, 60), warm(85, 8, 60), warm(115, 3, 90), warm(155, 2, 120), work(3, 8, 150, 185)]),
    ex('Incline Dumbbell Press', [warm(25, 10, 60), warm(30, 5, 60), work(3, 10, 120)], NOTE_DB),
    ex('Romanian Deadlift', [warm(95, 8, 60), warm(115, 5, 90), work(3, 10, 120)]),
    ex('Seated Cable Rows', [warm(55, 10, 60), work(3, 10, 90)]),
    ex('Butterfly', [work(2, 12, 60)], 'Chest Fly in Strong.'),
    ex('Dumbbell Raise', [work(2, 15, 60)], `Lateral Raise (Dumbbell) in Strong. ${NOTE_DB}`),
    ex('Standing Dumbbell Calf Raise', [work(3, 15, 60)], NOTE_DB),
    ex('Triceps Pushdown', [work(2, 12, 60)]),
  ],
};

export const STARTER_WEEKS = 4;

export const STARTER_PROPOSAL: Proposal & { schemaVersion: number } = {
  schemaVersion: SCHEMA_VERSION,
  name: 'A/B/C Full Body',
  description: 'Your A, B and C Day from Strong: same exercises, set structure and rest timers, four weeks, three sessions a week.',
  daysPerWeek: 3,
  reason: 'Built from your Strong templates so the same workouts, warm-ups and timers are in Forge. Weights prefill from your last session; the squat has fixed weights because A and C Day differ.',
  weeks: Array.from({ length: STARTER_WEEKS }, () => ({ sessions: [A_DAY, B_DAY, C_DAY] })),
};
