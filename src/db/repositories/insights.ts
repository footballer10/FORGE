import { localDateKey } from '../../domain/calendar';
import { buildInsights, type Insight, type InsightLift } from '../../domain/insights';
import { e1rmSeries, liftSets } from '../../domain/prs';
import { weeklyResults } from '../../domain/streaks';
import { volumeSets } from '../../domain/volume';
import type { ID, SetEntry } from '../../domain/types';
import { weeklyTarget } from './achievements';
import { analyticsRepo } from './analytics';
import { profileRepo } from './profile';

const DISMISSED_KEY = 'forge.insights.dismissed';

/** Dismissed note ids live on this device only (a display preference, not training data). */
function readDismissed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export const insightsRepo = {
  /** Up to three plain-language notes for Home; `all` returns every note, dismissed or not (weekly review). */
  async current(all = false): Promise<Insight[]> {
    const data = await analyticsRepo.trainingData();
    if (!data.workouts.size) return [];
    const profile = await profileRepo.get();
    const today = localDateKey(new Date());
    const byExercise = new Map<ID, SetEntry[]>();
    for (const s of data.sets) {
      const arr = byExercise.get(s.exerciseId);
      if (arr) arr.push(s);
      else byExercise.set(s.exerciseId, [s]);
    }
    const lifts: InsightLift[] = [];
    for (const [exerciseId, sets] of byExercise) {
      const exercise = data.exercises.get(exerciseId);
      if (!exercise) continue;
      const series = e1rmSeries(liftSets(sets, exercise, data.workouts, data.metrics, data.unit), profile.e1rmFormula);
      if (series.length) lifts.push({ exerciseId, name: exercise.name, series });
    }
    const target = await weeklyTarget();
    const weeks = weeklyResults([...data.workouts.values()].map((w) => ({ id: w.id, startedAt: w.startedAt })), target, today);
    return buildInsights(
      {
      today,
      unit: data.unit,
      lifts,
      sets: volumeSets(data.sets, data.exercises, data.workouts, data.metrics, data.unit),
      weeks,
      target,
      dismissed: all ? undefined : readDismissed(),
      },
      all ? Infinity : undefined,
    );
  },

  dismiss(id: string): void {
    try {
      const s = readDismissed();
      s.add(id);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...s].slice(-200)));
    } catch {
      /* storage unavailable: the note simply returns next time */
    }
  },
};
