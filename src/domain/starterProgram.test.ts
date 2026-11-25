import { describe, expect, it } from 'vitest';
import library from '../data/free-exercise-db.json';
import { proposalExerciseNames, proposalToDraft, validateProposal } from './programProposal';
import { A_DAY, B_DAY, C_DAY, STARTER_PROPOSAL, STARTER_WEEKS } from './starterProgram';
import { STRONG_NAME_HINTS } from './strongNames';

const names = new Set((library as { name: string }[]).map((e) => e.name));

describe('starter program (A/B/C Day from the Strong templates)', () => {
  it('passes the same validation as a program pasted from Claude', () => {
    const { proposal, errors } = validateProposal(JSON.parse(JSON.stringify(STARTER_PROPOSAL)));
    expect(errors).toEqual([]);
    expect(proposal?.weeks).toHaveLength(STARTER_WEEKS);
    expect(proposal?.daysPerWeek).toBe(3);
  });

  it('uses only exercises that exist in the library, and each has a Strong name for export', () => {
    const used = proposalExerciseNames(STARTER_PROPOSAL);
    expect(used).toHaveLength(18);
    for (const n of used) {
      expect(names.has(n), n).toBe(true);
      expect(STRONG_NAME_HINTS[n], n).toBeTruthy();
    }
  });

  it('has the exercises, set counts and rest timers from the templates', () => {
    const shape = (s: typeof A_DAY) => s.exercises.map((e) => [e.exercise, e.sets.reduce((n, t) => n + (t.count ?? 1), 0)]);
    expect(shape(A_DAY)).toEqual([['Barbell Squat', 8], ['Barbell Bench Press - Medium Grip', 7], ['Dumbbell Incline Row', 4], ['Leg Extensions', 2], ['Dumbbell Raise', 2], ['Triceps Pushdown', 2]]);
    expect(shape(B_DAY)).toEqual([['Barbell Deadlift', 8], ['Barbell Shoulder Press', 6], ['Close-Grip Front Lat Pulldown', 4], ['Suspended Split Squat', 4], ['Seated Leg Curl', 2], ['Dumbbell Bicep Curl', 2], ['Hanging Leg Raise', 3]]);
    expect(shape(C_DAY)).toEqual([['Barbell Squat', 7], ['Incline Dumbbell Press', 5], ['Romanian Deadlift', 5], ['Seated Cable Rows', 4], ['Butterfly', 2], ['Dumbbell Raise', 2], ['Standing Dumbbell Calf Raise', 3], ['Triceps Pushdown', 2]]);

    let k = 0;
    const { draft, missing } = proposalToDraft(STARTER_PROPOSAL, (n) => n, 'lb', () => `k${k++}`);
    expect(missing).toEqual([]);
    const rests = (day: number, ex: number) => draft[0]!.sessions[day]!.exercises[ex]!.targets.map((t) => t.restSec);
    expect(rests(0, 0)).toEqual([60, 60, 90, 90, 120, 180, 180, 180]); // A Day squat: 1:00 1:00 1:30 1:30 2:00 3:00 3:00 3:00
    expect(rests(0, 1)).toEqual([60, 60, 90, 120, 150, 150, 150]); // A Day bench
    expect(rests(1, 1)).toEqual([60, 60, 90, 120, 120, 120]); // B Day overhead press
    expect(rests(2, 0)).toEqual([60, 60, 90, 120, 150, 150, 150]); // C Day squat
    expect(rests(2, 1)).toEqual([60, 60, 120, 120, 120]); // C Day incline press
    for (const s of draft[0]!.sessions) for (const e of s.exercises) for (const t of e.targets) expect(t.restSec, e.exerciseId).toBeDefined();
  });

  it('marks warm-ups as warm-ups and keeps squat weights apart between A and C Day', () => {
    const a = A_DAY.exercises[0]!.sets;
    const c = C_DAY.exercises[0]!.sets;
    expect(a.filter((s) => s.type === 'warmup')).toHaveLength(5);
    expect(c.filter((s) => s.type === 'warmup')).toHaveLength(4);
    expect(a.at(-1)).toMatchObject({ count: 3, reps: 6, weight: 205 });
    expect(c.at(-1)).toMatchObject({ count: 3, reps: 8, weight: 185 });
  });
});
