import { E1RM_FORMULA } from '../../domain/e1rm';
import { e1rmSeries, liftSets, type E1rmPoint } from '../../domain/prs';
import type { Profile, BodyMetric, Exercise, ID, SetEntry, WeightUnit, Workout } from '../../domain/types';
import { db } from '../schema';
import type { ReviewLift } from '../../domain/yearReview';
import { createRepo } from './base';
import { profileRepo } from './profile';

const bodyMetrics = createRepo(db.bodyMetrics);

export interface LiftedExercise {
  exercise: Exercise;
  sets: number;
  lastDate: string;
}

export interface TrainingData {
  sets: SetEntry[];
  exercises: Map<ID, Exercise>;
  workouts: Map<ID, Workout>;
  metrics: BodyMetric[];
  unit: WeightUnit;
}

export interface ExerciseAnalyticsInput {
  exercise: Exercise;
  sets: SetEntry[];
  workouts: Map<ID, Workout>;
  metrics: BodyMetric[];
}

/** Read-only queries feeding the pure analytics in `src/domain`. Only finished, non-trashed workouts count. */
export interface StrengthLift {
  exercise: Exercise;
  series: E1rmPoint[];
}

export const analyticsRepo = {
  /** Every lift with at least one estimated 1RM, with its series (oldest first), most recently trained first. */
  async strengthLifts(): Promise<StrengthLift[]> {
    const t = await this.trainingData();
    const byEx = new Map<ID, SetEntry[]>();
    for (const s of t.sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
    const out: StrengthLift[] = [];
    for (const [id, sets] of byEx) {
      const exercise = t.exercises.get(id);
      if (!exercise) continue;
      const series = e1rmSeries(liftSets(sets, exercise, t.workouts, t.metrics, t.unit), E1RM_FORMULA);
      if (series.length) out.push({ exercise, series });
    }
    return out.sort((a, b) => b.series.at(-1)!.date.localeCompare(a.series.at(-1)!.date));
  },

  /** Inputs for the year in review: finished workouts and every lift's analytic sets (all time, for baselines). */
  async yearReviewData(): Promise<{ workouts: { id: ID; startedAt: string; endedAt?: string }[]; lifts: ReviewLift[]; weeklyTarget: number; unit: WeightUnit }> {
    const t = await this.trainingData();
    const profile = await profileRepo.get();
    const byEx = new Map<ID, SetEntry[]>();
    for (const s of t.sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
    const lifts: ReviewLift[] = [];
    for (const [id, sets] of byEx) {
      const exercise = t.exercises.get(id);
      if (!exercise) continue;
      const ls = liftSets(sets, exercise, t.workouts, t.metrics, t.unit);
      if (ls.length) lifts.push({ exerciseId: id, name: exercise.name, sets: ls });
    }
    const workouts = [...t.workouts.values()].map((w) => ({ id: w.id, startedAt: w.startedAt, ...(w.endedAt ? { endedAt: w.endedAt } : {}) }));
    return { workouts, lifts, weeklyTarget: profile.plannedDaysPerWeek, unit: t.unit };
  },

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

  /** Every completed non-warm-up set of finished, non-trashed workouts, with exercises, workouts and weigh-ins. */
  async trainingData(): Promise<TrainingData> {
    const workouts = new Map<ID, Workout>();
    for (const w of await db.workouts.filter((w) => !!w.endedAt && !w.deletedAt).toArray()) workouts.set(w.id, w);
    const sets = await db.sets
      .filter((s) => !s.deletedAt && !!s.completedAt && s.type !== 'warmup' && workouts.has(s.workoutId))
      .toArray();
    const exercises = new Map<ID, Exercise>();
    for (const e of await db.exercises.bulkGet([...new Set(sets.map((s) => s.exerciseId))])) if (e) exercises.set(e.id, e);
    const metrics = await db.bodyMetrics.where('kind').equals('bodyweight').filter((m) => !m.deletedAt).toArray();
    return { sets, exercises, workouts, metrics, unit: (await profileRepo.get()).weightUnit };
  },

  /** Strength score lifts and tier standards stored on the profile. */
  async scoreSetup(): Promise<Pick<Profile, 'strengthScoreLifts' | 'strengthStandards'>> {
    const p = await profileRepo.get();
    return { strengthScoreLifts: p.strengthScoreLifts, strengthStandards: p.strengthStandards };
  },
  async saveScoreSetup(setup: Pick<Profile, 'strengthScoreLifts' | 'strengthStandards'>): Promise<void> {
    await profileRepo.update(setup);
  },
  /** Record a weigh-in (same table the Milestone 5 bodyweight log will use). */
  async logBodyweight(date: string, value: number, unit: WeightUnit): Promise<void> {
    await bodyMetrics.create({ date, kind: 'bodyweight', value, unit });
  },

  async exercisesByIds(ids: ID[]): Promise<Map<ID, Exercise>> {
    const out = new Map<ID, Exercise>();
    for (const e of await db.exercises.bulkGet(ids)) if (e) out.set(e.id, e);
    return out;
  },

  async weightUnit() {
    return (await profileRepo.get()).weightUnit;
  },
  async e1rmFormula() {
    return E1RM_FORMULA;
  },
  async setE1rmFormula(f: import('../../domain/types').E1rmFormula) {
    await profileRepo.update({ e1rmFormula: f });
  },
};
