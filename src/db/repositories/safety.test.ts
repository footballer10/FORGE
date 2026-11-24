import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { clearAllData, exerciseRepo, trashRepo, undoRepo, workoutRepo } from './index';

const ex = { name: 'Squat', aliases: [], equipment: 'barbell' as const, primaryMuscles: [], secondaryMuscles: [], pattern: 'squat' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const };
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function workoutWithSet(exerciseId: string) {
  const w = await workoutRepo.start({ name: 'Legs' });
  const we = await workoutRepo.addExercise(w.id, exerciseId);
  const s = await workoutRepo.addSet(we.id, { weight: 225, reps: 5, completedAt: new Date().toISOString() });
  await workoutRepo.finish(w.id);
  return { w, we, s };
}

beforeEach(clearAllData);

describe('undoRepo', () => {
  it('reverts a delete', async () => {
    const e = await exerciseRepo.create(ex);
    const { w } = await workoutWithSet(e.id);
    await workoutRepo.deleteUndoable(w.id);
    expect((await workoutRepo.get(w.id))?.deletedAt).toBeDefined();
    expect(await undoRepo.undoLatest()).toBe('Deleted workout');
    expect((await workoutRepo.get(w.id))?.deletedAt).toBeUndefined();
    expect(await undoRepo.undoLatest()).toBeUndefined();
  });

  it('removes created rows and restores changed ones, in stack order', async () => {
    const e = await exerciseRepo.create(ex);
    await undoRepo.run('rename', { exercises: [e.id] }, async () => {
      await exerciseRepo.update(e.id, { name: 'Back Squat' });
    });
    await undoRepo.run('add', {}, async () => {
      const x = await exerciseRepo.create({ ...ex, name: 'New' });
      return { exercises: [x.id] };
    });
    expect(await exerciseRepo.list()).toHaveLength(2);
    await undoRepo.undoLatest();
    expect(await exerciseRepo.list()).toHaveLength(1);
    await undoRepo.undoLatest();
    expect((await exerciseRepo.get(e.id))?.name).toBe('Squat');
  });

  it('keeps only the latest 10 entries', async () => {
    for (let i = 0; i < 13; i++) await undoRepo.record(`a${i}`, {});
    expect(await db.undo.count()).toBe(10);
    expect((await undoRepo.latest())?.label).toBe('a12');
  });
});

describe('trashRepo', () => {
  it('lists, restores and permanently removes a workout with its children', async () => {
    const e = await exerciseRepo.create(ex);
    const { w } = await workoutWithSet(e.id);
    await workoutRepo.softDelete(w.id);
    expect((await trashRepo.list()).workouts.map((x) => x.id)).toEqual([w.id]);
    await trashRepo.restoreWorkout(w.id);
    expect((await trashRepo.list()).workouts).toHaveLength(0);
    await workoutRepo.softDelete(w.id);
    await trashRepo.purgeWorkout(w.id);
    expect(await db.workouts.count()).toBe(0);
    expect(await db.sets.count()).toBe(0);
    expect(await db.workoutExercises.count()).toBe(0);
  });

  it('purges only items older than 30 days', async () => {
    const e = await exerciseRepo.create(ex);
    const old = await workoutWithSet(e.id);
    const recent = await workoutWithSet(e.id);
    await db.workouts.update(old.w.id, { deletedAt: daysAgo(31) });
    await db.workouts.update(recent.w.id, { deletedAt: daysAgo(5) });
    expect(await trashRepo.purgeExpired()).toEqual({ workouts: 1, exercises: 0 });
    expect(await db.workouts.get(old.w.id)).toBeUndefined();
    expect(await db.workouts.get(recent.w.id)).toBeDefined();
  });

  it('never purges library exercises or exercises still used by logged sets', async () => {
    const custom = await exerciseRepo.create({ ...ex, name: 'Custom' });
    const lib = await exerciseRepo.create({ ...ex, name: 'Lib', source: 'library', sourceRef: 'lib-1' });
    const used = await exerciseRepo.create({ ...ex, name: 'Used' });
    await workoutWithSet(used.id);
    for (const x of [custom, lib, used]) await db.exercises.update(x.id, { deletedAt: daysAgo(40) });
    expect(await trashRepo.purgeExpired()).toEqual({ workouts: 0, exercises: 1 });
    expect(await db.exercises.get(custom.id)).toBeUndefined();
    expect(await db.exercises.get(lib.id)).toBeDefined();
    expect(await db.exercises.get(used.id)).toBeDefined();
  });

  it('trashed workouts do not feed last-session prefill', async () => {
    const e = await exerciseRepo.create(ex);
    const { w } = await workoutWithSet(e.id);
    expect(await workoutRepo.lastSetsFor(e.id)).toHaveLength(1);
    await workoutRepo.softDelete(w.id);
    expect(await workoutRepo.lastSetsFor(e.id)).toHaveLength(0);
  });
});
