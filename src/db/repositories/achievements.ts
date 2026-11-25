import { evaluateAchievements, newAchievements, type AchievementLift } from '../../domain/achievements';
import { localDateKey } from '../../domain/calendar';
import { liftSets, detectPrs, e1rmSeries, type PrEvent } from '../../domain/prs';
import { streakSummary, weeklyResults, type StreakSummary, type WeekResult } from '../../domain/streaks';
import type { Achievement, ID, SetEntry } from '../../domain/types';
import { db } from '../schema';
import { analyticsRepo } from './analytics';
import { createRepo, nowIso } from './base';
import { profileRepo } from './profile';

const base = createRepo(db.achievements);

export interface NamedPr extends PrEvent {
  exerciseId: ID;
  exerciseName: string;
}

export interface WorkoutSummary {
  name: string;
  durationMin?: number;
  hardSets: number;
  exercises: number;
  prs: NamedPr[];
  streak?: StreakSummary;
}

/** Planned training days per week: the active program's `daysPerWeek`, else the profile value. */
export async function weeklyTarget(): Promise<number> {
  const active = (await db.programs.filter((p) => p.status === 'active' && !p.deletedAt).toArray())[0];
  return active?.daysPerWeek ?? (await profileRepo.get()).plannedDaysPerWeek;
}

async function allPrs(): Promise<{ prs: NamedPr[]; weeks: WeekResult[]; summary?: StreakSummary; trainingData: Awaited<ReturnType<typeof analyticsRepo.trainingData>> }> {
  const data = await analyticsRepo.trainingData();
  const profile = await profileRepo.get();
  const byExercise = new Map<ID, SetEntry[]>();
  for (const s of data.sets) {
    const arr = byExercise.get(s.exerciseId);
    if (arr) arr.push(s);
    else byExercise.set(s.exerciseId, [s]);
  }
  const prs: NamedPr[] = [];
  for (const [exerciseId, sets] of byExercise) {
    const exercise = data.exercises.get(exerciseId);
    if (!exercise) continue;
    const ls = liftSets(sets, exercise, data.workouts, data.metrics, data.unit);
    for (const p of detectPrs(ls, profile.e1rmFormula)) prs.push({ ...p, exerciseId, exerciseName: exercise.name });
  }
  prs.sort((a, b) => b.date.localeCompare(a.date));
  const target = await weeklyTarget();
  const weeks = weeklyResults([...data.workouts.values()].map((w) => ({ id: w.id, startedAt: w.startedAt })), target, localDateKey(new Date()));
  return { prs, weeks, summary: weeks.length ? streakSummary(weeks, target) : undefined, trainingData: data };
}

export const achievementsRepo = {
  ...base,

  /** Weekly streak against planned days (undefined with no workouts or no target). */
  async streak(): Promise<StreakSummary | undefined> {
    return (await allPrs()).summary;
  },

  /** Most recent PRs, newest first (one line per kind and rep count per workout). */
  async recentPrs(limit = 5): Promise<NamedPr[]> {
    return (await allPrs()).prs.slice(0, limit);
  },

  /** Post-workout summary for a just-finished workout. */
  async summaryFor(workoutId: ID): Promise<WorkoutSummary | undefined> {
    const { prs, summary, trainingData } = await allPrs();
    const w = trainingData.workouts.get(workoutId);
    if (!w) return undefined;
    const sets = trainingData.sets.filter((s) => s.workoutId === workoutId);
    const durationMin = w.endedAt ? Math.max(1, Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60000)) : undefined;
    return {
      name: w.name,
      ...(durationMin !== undefined ? { durationMin } : {}),
      hardSets: sets.length,
      exercises: new Set(sets.map((s) => s.exerciseId)).size,
      prs: prs.filter((p) => p.workoutId === workoutId),
      ...(summary ? { streak: summary } : {}),
    };
  },

  /** True when the just-completed set beats every earlier finished workout's load at the same rep count (rep PR). */
  async isRepPr(setId: ID): Promise<boolean> {
    const set = await db.sets.get(setId);
    if (!set || !set.completedAt) return false;
    const input = await analyticsRepo.exerciseInput(set.exerciseId);
    const current = await db.workouts.get(set.workoutId);
    if (!input || !current) return false;
    const workouts = new Map(input.workouts);
    workouts.set(current.id, current);
    const profile = await profileRepo.get();
    const ls = liftSets(input.sets, input.exercise, workouts, input.metrics, await analyticsRepo.weightUnit());
    const mine = ls.find((l) => l.setId === setId);
    if (!mine) return false;
    return detectPrs(ls, profile.e1rmFormula).some((e) => e.kind === 'rep' && e.workoutId === current.id && e.reps === mine.reps && e.value === mine.load);
  },

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
    const target = await weeklyTarget();
    const weeks = weeklyResults(workouts.map((w) => ({ id: w.id, startedAt: w.date })), target, localDateKey(new Date()));
    const earned = evaluateAchievements({ workouts, prs, lifts, weeks, unit: data.unit });
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
