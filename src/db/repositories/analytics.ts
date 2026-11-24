import type { BodyMetric, Exercise, ID, SetEntry, Workout } from '../../domain/types';
import { db } from '../schema';
import { profileRepo } from './profile';

export interface LiftedExercise {
  exercise: Exercise;
  sets: number;
  lastDate: string;
}

export interface ExerciseAnalyticsInput {
  exercise: Exercise;
  sets: SetEntry[];
  workouts: Map<ID, Workout>;
  metrics: BodyMetric[];
}

/** Read-only queries feeding the pure analytics in `src/domain`. Only finished, non-trashed workouts count. */
export const analyticsRepo = {
  /** Exercises with at least one completed non-warm-up set, most recently trained first. */
  async liftedExercises(): Promise<LiftedExercise[]> {
    const done = new Set((await db.workouts.filter((w) => !!w.endedAt && !w.deletedAt).primaryKeys()) as ID[]);
    const agg = new Map<ID, { sets: number; lastDate: string }>();
    await db.sets
      .filter((s) => !s.deletedAt && !!s.completedAt && s.type !== 'warmup' && done.has(s.workoutId))
      .each((s) => {
        const a = agg.get(s.exerciseId) ?? { sets: 0, lastDate: '' };
        a.sets += 1;
        if ((s.completedAt as string) > a.lastDate) a.lastDate = s.completedAt as string;
        agg.set(s.exerciseId, a);
      });
    const exercises = await db.exercises.bulkGet([...agg.keys()]);
    return exercises
      .flatMap((e) => (e && !e.deletedAt ? [{ exercise: e, ...(agg.get(e.id) as { sets: number; lastDate: string }) }] : []))
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  },

  async exerciseInput(exerciseId: ID): Promise<ExerciseAnalyticsInput | undefined> {
    const exercise = await db.exercises.get(exerciseId);
    if (!exercise) return undefined;
    const sets = await db.sets.where('exerciseId').equals(exerciseId).filter((s) => !s.deletedAt).toArray();
    const ids = [...new Set(sets.map((s) => s.workoutId))];
    const rows = await db.workouts.bulkGet(ids);
    const workouts = new Map<ID, Workout>();
    for (const w of rows) if (w && w.endedAt && !w.deletedAt) workouts.set(w.id, w);
    const metrics = await db.bodyMetrics.where('kind').equals('bodyweight').filter((m) => !m.deletedAt).toArray();
    return { exercise, sets, workouts, metrics };
  },

  async weightUnit() {
    return (await profileRepo.get()).weightUnit;
  },
  async e1rmFormula() {
    return (await profileRepo.get()).e1rmFormula;
  },
  async setE1rmFormula(f: import('../../domain/types').E1rmFormula) {
    await profileRepo.update({ e1rmFormula: f });
  },
};
