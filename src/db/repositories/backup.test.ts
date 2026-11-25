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

  describe('export to Strong with a selection', () => {
    const lib = (name: string, extra: object = {}) => exerciseRepo.create({ ...ex, name, source: 'library' as const, ...extra });
    async function logged(name: string, exs: { exerciseId: string; sets: { type: 'warmup' | 'working'; weight: number; reps: number }[] }[]) {
      const w = await workoutRepo.start({ name });
      for (const e of exs) {
        const we = await workoutRepo.addExercise(w.id, e.exerciseId);
        for (const s of e.sets) await workoutRepo.addSet(we.id, { ...s, unit: 'lb', completedAt: nowIso() });
      }
      await workoutRepo.finish(w.id);
      return w;
    }

    it('writes Strong names, W for warm-ups and pair totals, only for the chosen workouts', async () => {
      const squat = await lib('Barbell Squat');
      const row = await lib('Dumbbell Incline Row', { equipment: 'dumbbell', loadModel: 'perImplement' });
      const a = await logged('A Day', [
        { exerciseId: squat.id, sets: [{ type: 'warmup', weight: 45, reps: 8 }, { type: 'working', weight: 205, reps: 6 }, { type: 'working', weight: 205, reps: 6 }] },
        { exerciseId: row.id, sets: [{ type: 'working', weight: 50, reps: 10 }] },
      ]);
      await logged('B Day', [{ exerciseId: squat.id, sets: [{ type: 'working', weight: 225, reps: 5 }] }]);

      const only = (await backupRepo.strongCsv('lb', [a.id])).split('\n');
      expect(only).toHaveLength(5); // header + 4 sets, B Day left out
      expect(only[1]).toContain(',A Day,');
      expect(only[1]).toContain('Squat (Barbell),W,45,8');
      expect(only[2]).toContain('Squat (Barbell),1,205,6');
      expect(only[3]).toContain('Squat (Barbell),2,205,6');
      expect(only[4]).toContain('Incline Row (Dumbbell),1,100,10'); // 50 lb each, written as the 100 lb pair total
      expect((await backupRepo.strongCsv('lb')).split('\n')).toHaveLength(6);
    });

    it('lists workouts with a from-Strong flag and flags names it had to guess', async () => {
      const squat = await lib('Barbell Squat');
      const odd = await lib('Zercher Squat');
      const w = await logged('Legs', [{ exerciseId: squat.id, sets: [{ type: 'working', weight: 100, reps: 5 }] }, { exerciseId: odd.id, sets: [{ type: 'working', weight: 80, reps: 5 }] }]);
      const list = await backupRepo.strongExportList();
      expect(list).toEqual([expect.objectContaining({ id: w.id, name: 'Legs', sets: 2, fromStrong: false })]);

      const check = await backupRepo.strongNameCheck([w.id]);
      expect(check.find((c) => c.forgeName === 'Barbell Squat')?.strong).toEqual({ name: 'Squat (Barbell)', source: 'hint' });
      expect(check.find((c) => c.forgeName === 'Zercher Squat')?.strong.source).toBe('guess');

      await backupRepo.setStrongNames({ [odd.id]: ' Zercher Squat (Barbell) ' });
      expect((await backupRepo.strongCsv('lb', [w.id])).split('\n').some((l) => l.includes('Zercher Squat (Barbell),1,80,5'))).toBe(true);
      expect((await backupRepo.strongNameCheck([w.id])).find((c) => c.forgeName === 'Zercher Squat')?.strong.source).toBe('set');
      await backupRepo.setStrongNames({ [odd.id]: '' });
      expect((await backupRepo.strongNameCheck([w.id])).find((c) => c.forgeName === 'Zercher Squat')?.strong.source).toBe('guess');
    });
  });
});
