import { EXPORT_TABLES, buildExport, planMerge, type ExportFile, type ExportTable, type TableMergePlan } from '../../domain/backup';
import { toStrongCsv, type ExportableWorkout } from '../../domain/strongExport';
import type { WeightUnit } from '../../domain/types';
import { db } from '../schema';
import { nowIso } from './base';

const table = (name: ExportTable) => db.table(name);

/** Backup, restore and CSV export. Photos, undo stack and app meta are not part of a backup. */
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

  /** Completed workouts as Strong-format CSV text. */
  async strongCsv(unit: WeightUnit): Promise<string> {
    const [workouts, wes, sets, exercises] = await Promise.all([
      db.workouts.filter((w) => !w.deletedAt && !!w.endedAt).toArray(),
      db.workoutExercises.filter((w) => !w.deletedAt).toArray(),
      db.sets.filter((s) => !s.deletedAt).toArray(),
      db.exercises.toArray(),
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
    return toStrongCsv(data, exercises, unit);
  },
};
