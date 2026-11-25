import { EXPORT_TABLES, buildExport, planMerge, type ExportFile, type ExportTable, type TableMergePlan } from '../../domain/backup';
import { toStrongCsv, type ExportableWorkout } from '../../domain/strongExport';
import { importedStrongNames, resolveStrongName, strongNameMap, type StrongName } from '../../domain/strongNames';
import { createRepo } from './base';
import type { WeightUnit } from '../../domain/types';
import { db } from '../schema';
import { nowIso } from './base';

const table = (name: ExportTable) => db.table(name);

/** Backup, restore and CSV export. Photos, undo stack and app meta are not part of a backup. */
export interface StrongExportItem {
  id: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  sets: number;
  fromStrong: boolean;
}

export const backupRepo = {
  /** Every row of every exported table, soft-deleted rows included (trash travels with the backup). */
  async exportAll(): Promise<ExportFile> {
    const tables: Partial<Record<ExportTable, Record<string, unknown>[]>> = {};
    for (const t of EXPORT_TABLES) tables[t] = await table(t).toArray();
    return buildExport(tables, nowIso());
  },

  /** What a merge restore would do, without writing anything. */
  async previewMerge(file: ExportFile): Promise<TableMergePlan[]> {
    const local: Partial<Record<ExportTable, Map<string, Record<string, unknown>>>> = {};
    for (const t of EXPORT_TABLES) {
      if (file.tables[t]?.length) local[t] = new Map((await table(t).toArray()).map((r) => [r.id as string, r]));
    }
    return planMerge(file, local);
  },

  /** Add missing rows and take newer rows from the backup; local-only data is kept. One transaction. */
  async restoreMerge(file: ExportFile): Promise<TableMergePlan[]> {
    const plan = await this.previewMerge(file);
    await db.transaction('rw', EXPORT_TABLES.map(table), async () => {
      for (const p of plan) await table(p.table).bulkPut([...p.add, ...p.update]);
    });
    return plan;
  },

  /** Replace the exported tables with the backup's contents. One transaction: all or nothing. */
  async restoreReplace(file: ExportFile): Promise<void> {
    await db.transaction('rw', EXPORT_TABLES.map(table), async () => {
      for (const t of EXPORT_TABLES) {
        await table(t).clear();
        const rows = file.tables[t];
        if (rows?.length) await table(t).bulkAdd(rows);
      }
    });
  },

  /** Finished workouts for the export picker, newest first. `fromStrong` marks ones that came in through a Strong import. */
  async strongExportList(): Promise<StrongExportItem[]> {
    const [workouts, sets] = await Promise.all([
      db.workouts.filter((w) => !w.deletedAt && !!w.endedAt).toArray(),
      db.sets.filter((s) => !s.deletedAt && !!s.completedAt).toArray(),
    ]);
    const counts = new Map<string, number>();
    for (const s of sets) counts.set(s.workoutId, (counts.get(s.workoutId) ?? 0) + 1);
    return workouts
      .map((w) => ({ id: w.id, name: w.name, startedAt: w.startedAt, ...(w.endedAt ? { endedAt: w.endedAt } : {}), sets: counts.get(w.id) ?? 0, fromStrong: !!w.importBatchId }))
      .filter((w) => w.sets > 0)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },

  /** Exercises used by these workouts and the Strong name each would be written under. */
  async strongNameCheck(workoutIds: string[]): Promise<{ exerciseId: string; forgeName: string; strong: StrongName }[]> {
    const ids = new Set(workoutIds);
    const [wes, exercises, batches] = await Promise.all([
      db.workoutExercises.filter((we) => !we.deletedAt && ids.has(we.workoutId)).toArray(),
      db.exercises.toArray(),
      db.importBatches.toArray(),
    ]);
    const imported = importedStrongNames(batches);
    const used = new Set(wes.map((we) => we.exerciseId));
    return exercises
      .filter((e) => used.has(e.id))
      .map((e) => ({ exerciseId: e.id, forgeName: e.name, strong: resolveStrongName(e, imported) }))
      .sort((a, b) => a.forgeName.localeCompare(b.forgeName));
  },

  /** Save the Strong name for exercises (blank clears it). */
  async setStrongNames(names: Record<string, string>): Promise<void> {
    const repo = createRepo(db.exercises);
    for (const [id, raw] of Object.entries(names)) {
      const name = raw.trim();
      const ex = await db.exercises.get(id);
      if (!ex) continue;
      if (name) await repo.update(id, { strongName: name });
      else {
        const { strongName: _drop, ...rest } = ex;
        await repo.put(rest);
      }
    }
  },

  /** Completed workouts as Strong-format CSV text; `workoutIds` limits it to the chosen workouts. */
  async strongCsv(unit: WeightUnit, workoutIds?: string[]): Promise<string> {
    const chosen = workoutIds ? new Set(workoutIds) : undefined;
    const [workouts, wes, sets, exercises, batches] = await Promise.all([
      db.workouts.filter((w) => !w.deletedAt && !!w.endedAt && (!chosen || chosen.has(w.id))).toArray(),
      db.workoutExercises.filter((w) => !w.deletedAt).toArray(),
      db.sets.filter((s) => !s.deletedAt).toArray(),
      db.exercises.toArray(),
      db.importBatches.toArray(),
    ]);
    const setsByWe = new Map<string, typeof sets>();
    for (const s of sets) setsByWe.set(s.workoutExerciseId, [...(setsByWe.get(s.workoutExerciseId) ?? []), s]);
    const wesByWorkout = new Map<string, typeof wes>();
    for (const we of wes) wesByWorkout.set(we.workoutId, [...(wesByWorkout.get(we.workoutId) ?? []), we]);
    const data: ExportableWorkout[] = workouts.map((workout) => ({
      workout,
      exercises: (wesByWorkout.get(workout.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((we) => ({ exerciseId: we.exerciseId, sets: setsByWe.get(we.id) ?? [], ...(we.notes ? { notes: we.notes } : {}) })),
    }));
    return toStrongCsv(data, exercises, unit, strongNameMap(exercises, importedStrongNames(batches)));
  },
};
