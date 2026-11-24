import type { ID, SetEntry, Workout, WorkoutExercise } from '../../domain/types';
import { db } from '../schema';
import { createRepo, nowIso, type NewEntity } from './base';

export interface FullWorkout {
  workout: Workout;
  exercises: (WorkoutExercise & { sets: SetEntry[] })[];
}

const workoutBase = createRepo(db.workouts);
const workoutExerciseBase = createRepo(db.workoutExercises);
const setBase = createRepo(db.sets);

/**
 * Workouts with their exercises and sets. Every mutation writes through immediately
 * (crash safety): there is no in-memory-only workout state.
 */
export const workoutRepo = {
  ...workoutBase,

  /** Most recent workout with no endedAt that is not deleted. */
  async getActive(): Promise<Workout | undefined> {
    const open = await db.workouts.filter((w) => !w.endedAt && !w.deletedAt).toArray();
    return open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  },

  start(input: Partial<NewEntity<Workout>> = {}): Promise<Workout> {
    return workoutBase.create({ name: 'Workout', kind: 'strength', startedAt: nowIso(), ...input });
  },

  finish(id: ID): Promise<Workout> {
    return workoutBase.update(id, { endedAt: nowIso(), restTimerEndsAt: undefined });
  },

  /** Finished, non-deleted workouts, newest first. */
  async listHistory(limit = 50, offset = 0): Promise<Workout[]> {
    return db.workouts
      .orderBy('startedAt')
      .reverse()
      .filter((w) => !!w.endedAt && !w.deletedAt)
      .offset(offset)
      .limit(limit)
      .toArray();
  },

  async getFull(id: ID): Promise<FullWorkout | undefined> {
    const workout = await db.workouts.get(id);
    if (!workout) return undefined;
    const [wes, sets] = await Promise.all([
      db.workoutExercises.where('workoutId').equals(id).toArray(),
      db.sets.where('workoutId').equals(id).toArray(),
    ]);
    const exercises = wes
      .filter((we) => !we.deletedAt)
      .sort((a, b) => a.order - b.order)
      .map((we) => ({
        ...we,
        sets: sets.filter((s) => s.workoutExerciseId === we.id && !s.deletedAt).sort((a, b) => a.order - b.order),
      }));
    return { workout, exercises };
  },

  async addExercise(workoutId: ID, exerciseId: ID, extra: Partial<WorkoutExercise> = {}): Promise<WorkoutExercise> {
    const count = await db.workoutExercises.where('workoutId').equals(workoutId).filter((we) => !we.deletedAt).count();
    return workoutExerciseBase.create({ workoutId, exerciseId, order: count, ...extra });
  },

  updateExercise: workoutExerciseBase.update,
  removeExercise: workoutExerciseBase.softDelete,

  async addSet(workoutExerciseId: ID, input: Partial<SetEntry> = {}): Promise<SetEntry> {
    const we = await db.workoutExercises.get(workoutExerciseId);
    if (!we) throw new Error(`Not found: workoutExercises/${workoutExerciseId}`);
    const count = await db.sets.where('workoutExerciseId').equals(workoutExerciseId).filter((s) => !s.deletedAt).count();
    return setBase.create({
      type: 'working',
      unit: 'lb',
      order: count,
      ...input,
      workoutExerciseId,
      workoutId: we.workoutId,
      exerciseId: we.exerciseId,
    });
  },

  updateSet: setBase.update,
  removeSet: setBase.softDelete,

  /**
   * Sets from the most recent finished workout containing this exercise, for prefill.
   * Excludes the given workout (usually the active one).
   */
  async lastSetsFor(exerciseId: ID, excludeWorkoutId?: ID): Promise<SetEntry[]> {
    const sets = await db.sets
      .where('exerciseId')
      .equals(exerciseId)
      .filter((s) => !s.deletedAt && !!s.completedAt && s.workoutId !== excludeWorkoutId)
      .toArray();
    if (sets.length === 0) return [];
    const latest = sets.reduce((a, b) => ((a.completedAt ?? '') > (b.completedAt ?? '') ? a : b));
    return sets.filter((s) => s.workoutId === latest.workoutId).sort((a, b) => a.order - b.order);
  },
};
