/**
 * The storage API for the whole app. Screens and stores import from here only.
 * Swapping Dexie for a synced backend later means changing this layer, not the UI.
 */
import { db } from '../schema';
import { buildTree, draftToRows, latestVersions, versionChain, type DraftWeek, type ProgramTree } from '../../domain/program';
import { inferTraits, type InferredTraits } from '../../domain/exerciseInference';
import type { Exercise, MovementPattern, Muscle, Program } from '../../domain/types';
import { createRepo, newId, nowIso, type NewEntity } from './base';

export { workoutRepo, type FullWorkout } from './workouts';
export { profileRepo, defaultProfile } from './profile';
export { importer } from './importer';
export { backupRepo } from './backup';
import { undoRepo } from './undo';
export { undoRepo, UNDO_EVENT, type RowRefs } from './undo';
export { trashRepo } from './trash';
export { bodyRepo } from './body';
export { fitnessRepo } from './fitness';
export { photoRepo } from './photos';
export { coachRepo, type ProposalPreview } from './coach';
export { syncRepo, normalizeUrl, type SyncStatus } from './sync';
export { insightsRepo } from './insights';
export { achievementsRepo, type NamedPr, type WorkoutSummary } from './achievements';
export { analyticsRepo, type LiftedExercise, type ExerciseAnalyticsInput, type TrainingData } from './analytics';
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
  /** Exercise IDs ordered by most recent completed set, newest first. */
  async recentIds(limit = 40): Promise<string[]> {
    const seen = new Set<string>();
    await db.sets
      .orderBy('completedAt')
      .reverse()
      .until(() => seen.size >= limit)
      .each((s) => {
        if (s.completedAt) seen.add(s.exerciseId);
      });
    return [...seen];
  },
  /** Library seeding: sourceRefs already stored (including soft-deleted, so deleted exercises stay deleted). */
  async sourceRefs(): Promise<Set<string>> {
    return new Set((await db.exercises.toArray()).flatMap((e) => (e.sourceRef ? [e.sourceRef] : [])));
  },
  /** Exercises with no primary muscle (typically imported) and what the app would fill in for each. */
  async traitSuggestions(): Promise<{ exercise: Exercise; traits?: InferredTraits }[]> {
    const all = await db.exercises.filter((e) => !e.deletedAt).toArray();
    return all
      .filter((e) => e.primaryMuscles.length === 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((exercise) => {
        const traits = inferTraits(exercise.name, all);
        return { exercise, ...(traits ? { traits } : {}) };
      });
  },
  /** Writes muscles, pattern and unilateral for each exercise (the user's reviewed choices). Returns rows changed. */
  async applyTraits(entries: { id: string; primaryMuscles: Muscle[]; secondaryMuscles: Muscle[]; pattern: MovementPattern; unilateral: boolean }[]): Promise<number> {
    const t = nowIso();
    let n = 0;
    await db.transaction('rw', db.exercises, async () => {
      for (const { id, ...traits } of entries) {
        if (await db.exercises.update(id, { ...traits, updatedAt: t })) n++;
      }
    });
    return n;
  },
  bulkCreate: async (rows: NewEntity<Exercise>[]) => {
    const t = nowIso();
    await db.exercises.bulkAdd(rows.map((r) => ({ ...r, id: r.id ?? newId(), createdAt: t, updatedAt: t }) as Exercise));
  },
};

const routineBase = createRepo(db.routines);
export const routineRepo = {
  ...routineBase,
  /** Routines by name, A to Z. */
  async listSorted() {
    return (await db.routines.filter((r) => !r.deletedAt).toArray()).sort((a, b) => a.name.localeCompare(b.name));
  },
  /** Soft-delete with an undo entry (the undo bar offers it). */
  async deleteUndoable(id: string): Promise<void> {
    await undoRepo.run('Deleted routine', { routines: [id] }, () => routineBase.softDelete(id));
  },
};
export const programWeekRepo = createRepo(db.programWeeks);
export const plannedSessionRepo = createRepo(db.plannedSessions);

export interface ProgramFields {
  name: string;
  description?: string;
  daysPerWeek?: number;
  startDate?: string;
}

export const programRepo = {
  ...createRepo(db.programs),

  /** Newest version of every program, newest first. */
  async listLatest(): Promise<Program[]> {
    const all = await db.programs.filter((p) => !p.deletedAt).toArray();
    return latestVersions(all).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getTree(id: string): Promise<ProgramTree | undefined> {
    const program = await db.programs.get(id);
    if (!program) return undefined;
    const [weeks, sessions] = await Promise.all([
      db.programWeeks.where('programId').equals(id).filter((w) => !w.deletedAt).toArray(),
      db.plannedSessions.where('programId').equals(id).filter((s) => !s.deletedAt).toArray(),
    ]);
    return buildTree(program, weeks, sessions);
  },

  /** The program and its earlier versions, newest first. */
  async history(program: Program): Promise<Program[]> {
    return versionChain(program, await db.programs.toArray());
  },

  /**
   * Save a program as a new version. With `previousId` the old row is archived (its weeks and
   * sessions stay as they were) and the new row is version + 1 with `reason`; without it this is
   * version 1. Returns the new program.
   */
  async saveVersion(input: { previousId?: string; fields: ProgramFields; weeks: DraftWeek[]; reason: string; author?: Program['author'] }): Promise<Program> {
    const t = nowIso();
    return db.transaction('rw', [db.programs, db.programWeeks, db.plannedSessions], async () => {
      const prev = input.previousId ? await db.programs.get(input.previousId) : undefined;
      const { name, description, daysPerWeek, startDate } = input.fields;
      const program: Program = {
        id: newId(),
        createdAt: t,
        updatedAt: t,
        name,
        ...(description ? { description } : {}),
        version: (prev?.version ?? 0) + 1,
        changeReason: input.reason,
        ...(prev ? { previousVersionId: prev.id } : {}),
        status: prev ? (prev.status === 'archived' ? 'draft' : prev.status) : 'draft',
        ...(startDate ? { startDate } : {}),
        author: input.author ?? 'user',
        ...(daysPerWeek ? { daysPerWeek } : {}),
      };
      const rows = draftToRows(input.weeks, { week: newId, session: newId }, program.id);
      await db.programs.add(program);
      await db.programWeeks.bulkAdd(rows.weeks.map((w) => ({ ...w, createdAt: t, updatedAt: t })));
      await db.plannedSessions.bulkAdd(rows.sessions.map((s) => ({ ...s, createdAt: t, updatedAt: t })));
      if (prev) await db.programs.update(prev.id, { status: 'archived', updatedAt: t });
      return program;
    });
  },

  /** Only one program is active: activating one moves any other active program back to draft. */
  async setStatus(id: string, status: Program['status']): Promise<void> {
    const t = nowIso();
    await db.transaction('rw', db.programs, async () => {
      if (status === 'active') {
        const others = await db.programs.filter((p) => p.status === 'active' && p.id !== id && !p.deletedAt).toArray();
        for (const o of others) await db.programs.update(o.id, { status: 'draft', updatedAt: t });
      }
      await db.programs.update(id, { status, updatedAt: t });
    });
  },

  /** Soft-delete every version of the program (undoable). */
  async deleteUndoable(program: Program): Promise<void> {
    const chain = await programRepo.history(program);
    const programs = chain.map((p) => p.id);
    const [weeks, sessions] = await Promise.all([
      db.programWeeks.where('programId').anyOf(programs).primaryKeys(),
      db.plannedSessions.where('programId').anyOf(programs).primaryKeys(),
    ]);
    await undoRepo.run('Deleted program', { programs, programWeeks: weeks, plannedSessions: sessions }, async () => {
      const t = nowIso();
      await db.programs.bulkUpdate(programs.map((id) => ({ key: id, changes: { deletedAt: t, updatedAt: t } })));
    });
  },
};
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
