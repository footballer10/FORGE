import { weightFromRawRow, type BuiltImport, type DumbbellConvention } from '../../domain/importPlan';
import type { ID, ImportBatch } from '../../domain/types';
import { db } from '../schema';
import { nowIso } from './base';

/** Storage for Strong imports. Everything in `commit` lands in one transaction or not at all. */
export const importer = {
  async commit(built: BuiltImport): Promise<ImportBatch> {
    await db.transaction(
      'rw',
      [db.exercises, db.workouts, db.workoutExercises, db.sets, db.importBatches, db.rawImportRows],
      async () => {
        if (built.newExercises.length) await db.exercises.bulkAdd(built.newExercises);
        await db.importBatches.add(built.batch);
        if (built.workouts.length) await db.workouts.bulkAdd(built.workouts);
        if (built.workoutExercises.length) await db.workoutExercises.bulkAdd(built.workoutExercises);
        if (built.sets.length) await db.sets.bulkAdd(built.sets);
        if (built.rawRows.length) await db.rawImportRows.bulkAdd(built.rawRows);
      },
    );
    return built.batch;
  },

  /** Non-deleted workouts' start times, for duplicate detection. */
  async existingStarts(): Promise<{ startedAt: string }[]> {
    return (await db.workouts.filter((w) => !w.deletedAt).toArray()).map((w) => ({ startedAt: w.startedAt }));
  },

  async listBatches(): Promise<ImportBatch[]> {
    return (await db.importBatches.filter((b) => !b.deletedAt).toArray()).sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  },

  /**
   * Change the dumbbell convention for one Strong exercise name in a batch and rewrite the affected
   * set weights from the stored raw rows. Sets the user has since edited are not distinguished:
   * the raw row wins, so this is meant for fixing a convention soon after importing.
   * Returns the number of sets rewritten.
   */
  async reapplyConvention(batchId: ID, exerciseName: string, convention: DumbbellConvention): Promise<number> {
    return db.transaction('rw', [db.importBatches, db.rawImportRows, db.sets], async () => {
      const batch = await db.importBatches.get(batchId);
      const rule = batch?.conventions.exerciseRules[exerciseName];
      if (!batch || !rule) return 0;
      const rows = await db.rawImportRows.where('batchId').equals(batchId).toArray();
      let changed = 0;
      const t = nowIso();
      for (const row of rows) {
        if (!row.setId) continue;
        const w = weightFromRawRow(row.data, convention, batch.conventions.defaultUnit);
        if (!w || w.exerciseName !== exerciseName) continue;
        await db.sets.update(row.setId, { weight: w.weight, unit: w.unit, updatedAt: t });
        changed++;
      }
      await db.importBatches.put({
        ...batch,
        updatedAt: t,
        conventions: {
          ...batch.conventions,
          exerciseRules: { ...batch.conventions.exerciseRules, [exerciseName]: { ...rule, dumbbellConvention: convention } },
        },
      });
      return changed;
    });
  },
};
