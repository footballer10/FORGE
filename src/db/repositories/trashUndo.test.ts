import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bodyRepo, clearAllData, fitnessRepo, routineRepo, trashRepo, undoRepo } from './index';

beforeEach(clearAllData);

describe('routines in the trash', () => {
  it('lists, restores and purges a deleted routine', async () => {
    const r = await routineRepo.create({ name: 'Push A', exercises: [] });
    await routineRepo.deleteUndoable(r.id);
    expect((await trashRepo.list()).routines.map((x) => x.id)).toEqual([r.id]);
    await trashRepo.restoreRoutine(r.id);
    expect((await trashRepo.list()).routines).toHaveLength(0);
    expect((await routineRepo.listSorted()).map((x) => x.id)).toEqual([r.id]);
    await routineRepo.deleteUndoable(r.id);
    await trashRepo.purgeRoutine(r.id);
    expect(await routineRepo.get(r.id)).toBeUndefined();
  });

  it('purgeExpired removes routines deleted 30+ days ago', async () => {
    const r = await routineRepo.create({ name: 'Old', exercises: [] });
    await routineRepo.softDelete(r.id);
    const later = new Date(Date.now() + 31 * 86_400_000);
    expect((await trashRepo.purgeExpired(later)).routines).toBe(1);
  });
});

describe('undo for weigh-ins and fitness tests', () => {
  it('undoes deleting a weigh-in', async () => {
    const m = await bodyRepo.add('2026-11-20', 180, 'lb');
    await bodyRepo.remove(m.id);
    expect(await bodyRepo.weighIns()).toHaveLength(0);
    expect(await undoRepo.undoLatest()).toBe('Deleted weigh-in');
    expect((await bodyRepo.weighIns()).map((x) => x.id)).toEqual([m.id]);
  });

  it('undoes deleting a test result and a whole test with its results', async () => {
    const t = await fitnessRepo.addCustom('Rope climb', 'timeSec', 'lowerIsBetter');
    const a = await fitnessRepo.addResult(t.id, '2026-11-01', 30);
    await fitnessRepo.addResult(t.id, '2026-11-10', 28);
    await fitnessRepo.removeResult(a.id);
    expect(await undoRepo.undoLatest()).toBe('Deleted test result');
    await fitnessRepo.removeTest(t.id);
    const gone = await fitnessRepo.load();
    expect(gone.tests.some((x) => x.id === t.id)).toBe(false);
    expect(await undoRepo.undoLatest()).toBe('Deleted fitness test');
    const back = await fitnessRepo.load();
    expect(back.tests.some((x) => x.id === t.id)).toBe(true);
    expect(back.results.filter((r) => r.testId === t.id)).toHaveLength(2);
  });
});
