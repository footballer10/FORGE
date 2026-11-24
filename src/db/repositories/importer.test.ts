import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildImport, findDuplicates, matchExercises, summarizeExercises, type ImportChoices } from '../../domain/importPlan';
import { groupStrongWorkouts, parseStrongCsv } from '../../domain/strongParser';
import { clearAllData, exerciseRepo, importer, newId, nowIso, rawImportRowRepo, workoutRepo } from './index';
import { db } from '../schema';

const CSV = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2024-03-05 18:30:12,Push,1h,Bench Press (Barbell),1,185,5,0,0,,,',
  '2024-03-05 18:30:12,Push,1h,Bicep Curl (Dumbbell),1,60,10,0,0,,,',
  '2024-03-05 18:30:12,Push,1h,Bicep Curl (Dumbbell),2,55,10,0,0,,,',
  '2024-03-07 07:00:00,Pull,45m,Bicep Curl (Dumbbell),1,50,10,0,0,,,',
].join('\n');

const choices: ImportChoices = { defaultUnit: 'lb', dumbbellConvention: 'pairTotal', resolutions: {}, dumbbellOverrides: {} };

async function runImport(csv = CSV) {
  const parsed = parseStrongCsv(csv);
  if ('error' in parsed) throw new Error(parsed.error);
  const workouts = groupStrongWorkouts(parsed.rows);
  const library = await exerciseRepo.list();
  const matches = matchExercises(summarizeExercises(workouts), library);
  const duplicates = findDuplicates(workouts, await importer.existingStarts());
  const built = buildImport({ fileName: 'strong.csv', workouts, matches, library, choices, duplicates, ignoredRows: parsed.ignoredRows, now: nowIso(), newId });
  await importer.commit(built);
  return built;
}

beforeEach(clearAllData);

describe('importer', () => {
  it('stores workouts, sets, new exercises, batch and raw rows', async () => {
    const built = await runImport();
    expect(built.workouts).toHaveLength(2);
    expect(await db.sets.count()).toBe(4);
    expect(await db.workoutExercises.count()).toBe(3);
    expect((await exerciseRepo.list()).map((e) => e.name).sort()).toEqual(['Bench Press (Barbell)', 'Bicep Curl (Dumbbell)']);
    expect((await exerciseRepo.list()).every((e) => e.source === 'import')).toBe(true);
    const batches = await importer.listBatches();
    expect(batches).toHaveLength(1);
    expect(await rawImportRowRepo.forBatch(batches[0]!.id)).toHaveLength(4);
    expect((await workoutRepo.listHistory()).map((w) => w.name)).toEqual(['Pull', 'Push']);
  });

  it('re-importing the same file adds nothing (duplicates by start time)', async () => {
    await runImport();
    const again = await runImport();
    expect(again.workouts).toHaveLength(0);
    expect(again.batch.duplicateCount).toBe(2);
    expect(await db.sets.count()).toBe(4);
    expect(await db.workouts.count()).toBe(2);
    expect(await exerciseRepo.list()).toHaveLength(2);
  });

  it('maps a second import onto exercises created by the first', async () => {
    await runImport();
    const csv2 = 'Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n2024-04-01 10:00:00,Arms,Bicep Curl (Dumbbell),1,40,12';
    const built = await runImport(csv2);
    expect(built.newExercises).toHaveLength(0);
    expect(await exerciseRepo.list()).toHaveLength(2);
  });

  it('re-applies a dumbbell convention from the raw rows', async () => {
    const built = await runImport();
    const curlId = built.sets.find((s) => s.weight === 30)!.exerciseId;
    const weights = async () => (await db.sets.where('exerciseId').equals(curlId).toArray()).map((s) => s.weight).sort((a, b) => a! - b!);
    expect(await weights()).toEqual([25, 27.5, 30]);

    expect(await importer.reapplyConvention(built.batch.id, 'Bicep Curl (Dumbbell)', 'perImplement')).toBe(3);
    expect(await weights()).toEqual([50, 55, 60]);
    expect((await importer.listBatches())[0]!.conventions.exerciseRules['Bicep Curl (Dumbbell)']!.dumbbellConvention).toBe('perImplement');

    await importer.reapplyConvention(built.batch.id, 'Bicep Curl (Dumbbell)', 'pairTotal');
    expect(await weights()).toEqual([25, 27.5, 30]);
  });

  it('ignores unknown exercise names when re-applying', async () => {
    const built = await runImport();
    expect(await importer.reapplyConvention(built.batch.id, 'Nope', 'pairTotal')).toBe(0);
  });
});
