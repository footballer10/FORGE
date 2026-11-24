import { isExpired } from '../../domain/safety';
import type { Exercise, Workout } from '../../domain/types';
import { db } from '../schema';
import { nowIso } from './base';

/** Soft-deleted workouts and exercises, restore, and permanent removal. */
export const trashRepo = {
  async list(): Promise<{ workouts: Workout[]; exercises: Exercise[] }> {
    const [workouts, exercises] = await Promise.all([
      db.workouts.filter((w) => !!w.deletedAt).toArray(),
      db.exercises.filter((e) => !!e.deletedAt).toArray(),
    ]);
    const byDeleted = <T extends { deletedAt?: string }>(a: T, b: T) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '');
    return { workouts: workouts.sort(byDeleted), exercises: exercises.sort(byDeleted) };
  },

  async restoreWorkout(id: string): Promise<void> {
    const w = await db.workouts.get(id);
    if (!w) return;
    const { deletedAt: _d, ...rest } = w;
    await db.workouts.put({ ...rest, updatedAt: nowIso() });
  },

  async restoreExercise(id: string): Promise<void> {
    const e = await db.exercises.get(id);
    if (!e) return;
    const { deletedAt: _d, ...rest } = e;
    await db.exercises.put({ ...rest, updatedAt: nowIso() });
  },

  /** Permanently remove a workout with its exercises, sets and original import rows. */
  async purgeWorkout(id: string): Promise<void> {
    await db.transaction('rw', [db.workouts, db.workoutExercises, db.sets, db.rawImportRows], async () => {
      await db.sets.where('workoutId').equals(id).delete();
      await db.workoutExercises.where('workoutId').equals(id).delete();
      await db.rawImportRows.filter((r) => r.workoutId === id).delete();
      await db.workouts.delete(id);
    });
  },

  /**
   * Permanently remove an exercise. Refused (returns false) when logged sets still use it, and for
   * library exercises, which stay soft-deleted so the library seed does not bring them back.
   */
  async purgeExercise(id: string): Promise<boolean> {
    const e = await db.exercises.get(id);
    if (!e || e.sourceRef) return false;
    if ((await db.sets.where('exerciseId').equals(id).count()) > 0) return false;
    await db.workoutExercises.where('exerciseId').equals(id).delete();
    await db.exercises.delete(id);
    return true;
  },

  /** Remove everything that has been in the trash for 30 days or more. Returns counts. */
  async purgeExpired(now = new Date()): Promise<{ workouts: number; exercises: number }> {
    const { workouts, exercises } = await trashRepo.list();
    const w = workouts.filter((x) => x.deletedAt && isExpired(x.deletedAt, now));
    for (const x of w) await trashRepo.purgeWorkout(x.id);
    let ex = 0;
    for (const x of exercises.filter((e) => e.deletedAt && isExpired(e.deletedAt, now))) if (await trashRepo.purgeExercise(x.id)) ex++;
    return { workouts: w.length, exercises: ex };
  },
};
