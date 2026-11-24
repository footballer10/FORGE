/**
 * The storage API for the whole app. Screens and stores import from here only.
 * Swapping Dexie for a synced backend later means changing this layer, not the UI.
 */
import { db } from '../schema';
import { createRepo } from './base';

export { workoutRepo, type FullWorkout } from './workouts';
export { profileRepo, defaultProfile } from './profile';
export { newId, nowIso, type NewEntity, type Repository } from './base';

export const exerciseRepo = {
  ...createRepo(db.exercises),
  /** Case-insensitive match on name or alias (import matching, duplicate checks). */
  async findByName(name: string) {
    const q = name.trim().toLowerCase();
    return db.exercises
      .filter((e) => !e.deletedAt && (e.name.toLowerCase() === q || e.aliases.some((a) => a.toLowerCase() === q)))
      .first();
  },
};

export const routineRepo = createRepo(db.routines);
export const programRepo = createRepo(db.programs);
export const programWeekRepo = createRepo(db.programWeeks);
export const plannedSessionRepo = createRepo(db.plannedSessions);
export const bodyMetricRepo = createRepo(db.bodyMetrics);
export const fitnessTestRepo = createRepo(db.fitnessTests);
export const testResultRepo = createRepo(db.testResults);
export const progressPhotoRepo = createRepo(db.progressPhotos);
export const readinessRepo = createRepo(db.readiness);
export const importBatchRepo = createRepo(db.importBatches);
export const achievementRepo = createRepo(db.achievements);
export const aiDecisionRepo = createRepo(db.aiDecisions);

export const rawImportRowRepo = {
  bulkAdd: (rows: Parameters<typeof db.rawImportRows.bulkAdd>[0]) => db.rawImportRows.bulkAdd(rows),
  forBatch: (batchId: string) => db.rawImportRows.where('batchId').equals(batchId).sortBy('rowIndex'),
};

export const metaRepo = {
  get: async <T>(key: string): Promise<T | undefined> => (await db.meta.get(key))?.value as T | undefined,
  set: (key: string, value: unknown) => db.meta.put({ key, value }),
};

/** Wipe everything (restore-replace, tests). */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())));
}
