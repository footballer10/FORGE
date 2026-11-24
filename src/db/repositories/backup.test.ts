import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseExport } from '../../domain/backup';
import { db } from '../schema';
import { buildImport, matchExercises, summarizeExercises } from '../../domain/importPlan';
import { groupStrongWorkouts, parseStrongCsv } from '../../domain/strongParser';
import { backupRepo, clearAllData, exerciseRepo, importer, newId, nowIso, workoutRepo } from './index';

const ex = { name: 'Squat', aliases: [], equipment: 'barbell' as const, primaryMuscles: [], secondaryMuscles: [], pattern: 'squat' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const };

async function seed() {
  const e = await exerciseRepo.create(ex);
  const w = await workoutRepo.start({ name: 'Legs' });
  await workoutRepo.finish(w.id);
  return { e, w };
}
const roundTrip = async () => {
  const parsed = parseExport(JSON.stringify(await backupRepo.exportAll()));
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.file;
};

beforeEach(clearAllData);

describe('backupRepo', () => {
  it('exports everything including soft-deleted rows, and replace-restores into an empty db', async () => {
    const { e } = await seed();
    const gone = await exerciseRepo.create({ ...ex, name: 'Gone' });
    await exerciseRepo.softDelete(gone.id);
    const file = await roundTrip();
    expect(file.counts.exercises).toBe(2);
    await clearAllData();
    await backupRepo.restoreReplace(file);
    expect((await exerciseRepo.get(e.id))?.name).toBe('Squat');
    expect((await exerciseRepo.get(gone.id))?.deletedAt).toBeDefined();
    expect(await db.workouts.count()).toBe(1);
  });

  it('replace discards local-only data', async () => {
    await seed();
    const file = await roundTrip();
    const extra = await exerciseRepo.create({ ...ex, name: 'Local only' });
    await backupRepo.restoreReplace(file);
    expect(await exerciseRepo.get(extra.id)).toBeUndefined();
  });

  it('merge keeps local-only rows, adds missing ones and takes newer backup rows', async () => {
    const { e } = await seed();
    const file = await roundTrip();
    // Backup edits the exercise later than local, and carries a row local lacks.
    file.tables.exercises = [
      { ...file.tables.exercises![0]!, name: 'Back Squat', updatedAt: '2999-01-01T00:00:00.000Z' },
      { ...file.tables.exercises![0]!, id: 'from-backup', name: 'Backup only' },
    ];
    const local = await exerciseRepo.create({ ...ex, name: 'Local only' });
    const preview = await backupRepo.previewMerge(file);
    const p = preview.find((x) => x.table === 'exercises')!;
    expect([p.add.length, p.update.length]).toEqual([1, 1]);
    expect((await exerciseRepo.get(e.id))?.name).toBe('Squat');
    await backupRepo.restoreMerge(file);
    expect((await exerciseRepo.get(e.id))?.name).toBe('Back Squat');
    expect((await exerciseRepo.get('from-backup'))?.name).toBe('Backup only');
    expect((await exerciseRepo.get(local.id))?.name).toBe('Local only');
  });

  it('merge does not overwrite a newer local row', async () => {
    const { e } = await seed();
    const file = await roundTrip();
    await exerciseRepo.update(e.id, { name: 'Edited after backup' });
    await backupRepo.restoreMerge(file);
    expect((await exerciseRepo.get(e.id))?.name).toBe('Edited after backup');
  });

  it('exports imported workouts as Strong CSV (dumbbells back to pair totals)', async () => {
    const csv = [
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2024-03-05 18:30:12,Push,1h,Curl (Dumbbell),1,60,10,0,0,,,',
      '2024-03-05 18:30:12,Push,1h,Bench Press (Barbell),1,185,5,0,0,,,',
    ].join('\n');
    const parsed = parseStrongCsv(csv);
    if ('error' in parsed) throw new Error(parsed.error);
    const workouts = groupStrongWorkouts(parsed.rows);
    const library = await exerciseRepo.list();
    const built = buildImport({
      fileName: 'x.csv', workouts, matches: matchExercises(summarizeExercises(workouts), library), library,
      choices: { defaultUnit: 'lb', dumbbellConvention: 'pairTotal', resolutions: {}, dumbbellOverrides: {} },
      duplicates: new Set(), ignoredRows: 0, now: nowIso(), newId,
    });
    await importer.commit(built);
    const out = await backupRepo.strongCsv('lb');
    expect(out).toContain('Curl (Dumbbell),1,60,10');
    expect(out).toContain('Bench Press (Barbell),1,185,5');
    expect(out.split('\n')).toHaveLength(3);
  });
});
