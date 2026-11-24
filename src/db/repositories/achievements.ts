import { evaluateAchievements, newAchievements, type AchievementLift } from '../../domain/achievements';
import { liftSets, detectPrs, e1rmSeries } from '../../domain/prs';
import type { Achievement, ID, SetEntry } from '../../domain/types';
import { db } from '../schema';
import { analyticsRepo } from './analytics';
import { createRepo, nowIso } from './base';
import { profileRepo } from './profile';

const base = createRepo(db.achievements);

export const achievementsRepo = {
  ...base,

  /** Earned achievements, newest first. */
  async listNewestFirst(): Promise<Achievement[]> {
    return (await base.list()).sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
  },

  /** Earned but not yet shown (for the Home / summary celebration). */
  async unseen(): Promise<Achievement[]> {
    return (await base.list()).filter((a) => !a.seenAt).sort((a, b) => a.achievedAt.localeCompare(b.achievedAt));
  },

  async markSeen(ids: ID[]): Promise<void> {
    const t = nowIso();
    await db.achievements.bulkUpdate(ids.map((id) => ({ key: id, changes: { seenAt: t, updatedAt: t } })));
  },

  /**
   * Re-evaluate everything from the logged data and store achievements not stored yet (an earned
   * achievement is never removed, even if data later changes). Returns the newly stored ones.
   */
  async sync(): Promise<Achievement[]> {
    const data = await analyticsRepo.trainingData();
    const profile = await profileRepo.get();
    const hardByWorkout = new Map<ID, number>();
    const byExercise = new Map<ID, SetEntry[]>();
    for (const s of data.sets) {
      hardByWorkout.set(s.workoutId, (hardByWorkout.get(s.workoutId) ?? 0) + 1);
      const arr = byExercise.get(s.exerciseId);
      if (arr) arr.push(s);
      else byExercise.set(s.exerciseId, [s]);
    }
    const workouts = [...data.workouts.values()].map((w) => ({ id: w.id, date: w.startedAt, hardSets: hardByWorkout.get(w.id) ?? 0 }));
    const prs: { date: string; workoutId: ID }[] = [];
    const lifts: AchievementLift[] = [];
    const chosen = new Set(profile.strengthScoreLifts.map((l) => l.exerciseId));
    for (const [exerciseId, sets] of byExercise) {
      const exercise = data.exercises.get(exerciseId);
      if (!exercise) continue;
      const ls = liftSets(sets, exercise, data.workouts, data.metrics, data.unit);
      for (const p of detectPrs(ls, profile.e1rmFormula)) prs.push({ date: p.date, workoutId: p.workoutId });
      if (chosen.has(exerciseId)) lifts.push({ exerciseId, name: exercise.name, points: e1rmSeries(ls, profile.e1rmFormula) });
    }
    const earned = evaluateAchievements({ workouts, prs, lifts, unit: data.unit });
    const stored = new Set((await db.achievements.toArray()).map((a) => a.key));
    const out: Achievement[] = [];
    for (const a of newAchievements(earned, stored)) {
      out.push(
        await base.create({ key: a.key, title: a.title, description: a.description, achievedAt: a.achievedAt, workoutId: a.workoutId, value: a.value }),
      );
    }
    return out;
  },
};
