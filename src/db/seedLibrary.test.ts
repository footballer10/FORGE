import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LibraryRecord } from '../domain/exerciseMapper';
import { db } from './schema';
import { clearAllData, exerciseRepo, metaRepo } from './repositories';
import { seedLibrary } from './seedLibrary';

const rec = (id: string, name: string): LibraryRecord => ({
  id, name, force: 'push', mechanic: 'compound', equipment: 'barbell', category: 'strength',
  primaryMuscles: ['chest'], secondaryMuscles: [], instructions: [],
});
const recs = [rec('a', 'Bench Press'), rec('b', 'Squat')];

beforeEach(clearAllData);

describe('seedLibrary', () => {
  it('seeds once and is idempotent', async () => {
    expect(await seedLibrary(recs)).toEqual({ added: 2 });
    expect(await seedLibrary(recs)).toEqual({ added: 0 });
    expect(await exerciseRepo.list()).toHaveLength(2);
  });

  it('on a version bump adds only missing ones and keeps user edits and deletions', async () => {
    await seedLibrary(recs);
    const bench = (await exerciseRepo.list()).find((e) => e.sourceRef === 'a')!;
    const squat = (await exerciseRepo.list()).find((e) => e.sourceRef === 'b')!;
    await exerciseRepo.update(bench.id, { weightIncrement: 2.5 });
    await exerciseRepo.softDelete(squat.id);
    await metaRepo.set('librarySeedVersion', 0);
    expect(await seedLibrary([...recs, rec('c', 'Row')])).toEqual({ added: 1 });
    expect((await exerciseRepo.get(bench.id))?.weightIncrement).toBe(2.5);
    expect(await exerciseRepo.list()).toHaveLength(2);
  });
});

describe('exerciseRepo.recentIds', () => {
  it('orders by latest completed set, unique', async () => {
    await seedLibrary(recs);
    const [a, b] = await exerciseRepo.list();
    const { workoutRepo } = await import('./repositories');
    const w = await workoutRepo.start();
    const wa = await workoutRepo.addExercise(w.id, a!.id);
    const wb = await workoutRepo.addExercise(w.id, b!.id);
    const s1 = await workoutRepo.addSet(wa.id, { weight: 100, reps: 5 });
    const s2 = await workoutRepo.addSet(wb.id, { weight: 100, reps: 5 });
    await workoutRepo.updateSet(s1.id, { completedAt: '2026-11-01T10:00:00.000Z' });
    await workoutRepo.updateSet(s2.id, { completedAt: '2026-11-02T10:00:00.000Z' });
    expect(await exerciseRepo.recentIds()).toEqual([b!.id, a!.id]);
  });
});

describe('library version bump reclassifies untouched exercises only', () => {
  it('fixes a stale pattern but keeps an exercise the user edited', async () => {
    const a = { ...rec('a', 'Front Squat (Clean Grip)'), primaryMuscles: ['quadriceps' as const] };
    const b = { ...rec('b', 'Overhead Cable Curl'), equipment: 'cable', primaryMuscles: ['biceps' as const] };
    await seedLibrary([a, b]);
    const list = await exerciseRepo.list();
    const front = list.find((e) => e.sourceRef === 'a')!;
    const curl = list.find((e) => e.sourceRef === 'b')!;
    // Simulate the old mapping directly in the table (no timestamp change).
    await db.exercises.update(front.id, { pattern: 'hinge' });
    await db.exercises.update(curl.id, { pattern: 'verticalPush' });
    await exerciseRepo.update(curl.id, { weightIncrement: 2.5 }); // the user edited this one
    await metaRepo.set('librarySeedVersion', 1);
    await seedLibrary([a, b]);
    expect((await exerciseRepo.get(front.id))?.pattern).toBe('squat');
    expect((await exerciseRepo.get(curl.id))?.pattern).toBe('verticalPush');
  });
});
