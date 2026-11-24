import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, exerciseRepo, profileRepo, workoutRepo } from './index';

const bench = {
  name: 'Bench Press (Barbell)',
  aliases: ['Bench Press', 'Flat Bench'],
  equipment: 'barbell' as const,
  primaryMuscles: ['chest' as const],
  secondaryMuscles: ['triceps' as const, 'shoulders' as const],
  pattern: 'horizontalPush' as const,
  unilateral: false,
  defaultRestSec: 150,
  weightIncrement: 5,
  incrementUnit: 'lb' as const,
  loadModel: 'total' as const,
  source: 'library' as const,
};

beforeEach(clearAllData);

describe('exerciseRepo', () => {
  it('creates with ids/timestamps and finds by name or alias', async () => {
    const e = await exerciseRepo.create(bench);
    expect(e.id).toMatch(/[0-9a-f-]{36}/);
    expect(e.createdAt).toBe(e.updatedAt);
    expect((await exerciseRepo.findByName('flat bench'))?.id).toBe(e.id);
    expect(await exerciseRepo.findByName('squat')).toBeUndefined();
  });

  it('soft-deletes and restores', async () => {
    const e = await exerciseRepo.create(bench);
    await exerciseRepo.softDelete(e.id);
    expect(await exerciseRepo.list()).toHaveLength(0);
    expect(await exerciseRepo.listDeleted()).toHaveLength(1);
    await exerciseRepo.restore(e.id);
    expect((await exerciseRepo.get(e.id))?.deletedAt).toBeUndefined();
  });
});

describe('workoutRepo', () => {
  it('persists a workout with exercises and sets, resumes, and prefills from last session', async () => {
    const ex = await exerciseRepo.create(bench);

    const w1 = await workoutRepo.start({ name: 'Full body A' });
    expect((await workoutRepo.getActive())?.id).toBe(w1.id);
    const we = await workoutRepo.addExercise(w1.id, ex.id);
    const s1 = await workoutRepo.addSet(we.id, { weight: 135, reps: 5, type: 'warmup' });
    await workoutRepo.addSet(we.id, { weight: 205, reps: 5 });
    await workoutRepo.updateSet(s1.id, { completedAt: new Date().toISOString() });
    const full = await workoutRepo.getFull(w1.id);
    expect(full?.exercises[0]?.sets.map((s) => s.order)).toEqual([0, 1]);
    expect(full?.exercises[0]?.sets[1]).toMatchObject({ workoutId: w1.id, exerciseId: ex.id, unit: 'lb' });

    await workoutRepo.finish(w1.id);
    expect(await workoutRepo.getActive()).toBeUndefined();
    expect(await workoutRepo.listHistory()).toHaveLength(1);

    const w2 = await workoutRepo.start();
    const last = await workoutRepo.lastSetsFor(ex.id, w2.id);
    expect(last.map((s) => s.weight)).toEqual([135]);
  });

  it('removed sets disappear from the full workout', async () => {
    const ex = await exerciseRepo.create(bench);
    const w = await workoutRepo.start();
    const we = await workoutRepo.addExercise(w.id, ex.id);
    const s = await workoutRepo.addSet(we.id, { weight: 100, reps: 8 });
    await workoutRepo.removeSet(s.id);
    expect((await workoutRepo.getFull(w.id))?.exercises[0]?.sets).toHaveLength(0);
  });
});

describe('profileRepo', () => {
  it('creates defaults on first read and merges updates', async () => {
    const p = await profileRepo.get();
    expect(p).toMatchObject({ id: 'me', weightUnit: 'lb', weekStartsOn: 1, position: 'Fullback' });
    const u = await profileRepo.update({ plannedDaysPerWeek: 4 });
    expect(u.plannedDaysPerWeek).toBe(4);
    expect((await profileRepo.get()).plannedDaysPerWeek).toBe(4);
  });
});
