import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { analyticsRepo, clearAllData, exerciseRepo, workoutRepo } from './index';
import { detectPrs, liftSets } from '../../domain/prs';

const ex = { name: 'Bench', aliases: [], equipment: 'barbell' as const, primaryMuscles: [], secondaryMuscles: [], pattern: 'horizontalPush' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const };

async function session(exerciseId: string, day: string, weight: number, finish = true) {
  const w = await workoutRepo.start({ startedAt: `${day}T10:00:00.000Z` });
  const we = await workoutRepo.addExercise(w.id, exerciseId);
  await workoutRepo.addSet(we.id, { weight, reps: 5, completedAt: `${day}T10:30:00.000Z` });
  await workoutRepo.addSet(we.id, { type: 'warmup', weight: 45, reps: 10, completedAt: `${day}T10:20:00.000Z` });
  if (finish) await workoutRepo.finish(w.id);
  return w;
}

beforeEach(clearAllData);

describe('analyticsRepo', () => {
  it('lists lifted exercises from finished, non-trashed workouts, without warm-ups', async () => {
    const e = await exerciseRepo.create(ex);
    const other = await exerciseRepo.create({ ...ex, name: 'Row' });
    await session(e.id, '2026-04-01', 135);
    const trashed = await session(e.id, '2026-04-08', 140);
    await workoutRepo.softDelete(trashed.id);
    await session(other.id, '2026-04-09', 100, false); // unfinished
    const lifted = await analyticsRepo.liftedExercises();
    expect(lifted.map((l) => [l.exercise.name, l.sets])).toEqual([['Bench', 1]]);
  });

  it('feeds PR detection end to end', async () => {
    const e = await exerciseRepo.create(ex);
    await session(e.id, '2026-04-01', 135);
    await session(e.id, '2026-04-08', 140);
    const input = (await analyticsRepo.exerciseInput(e.id))!;
    const prs = detectPrs(liftSets(input.sets, input.exercise, input.workouts, input.metrics, 'lb'), 'epley');
    expect(prs.map((p) => p.kind).sort()).toEqual(['e1rm', 'rep', 'volume']);
  });

  it('stores the chosen formula in the profile', async () => {
    await analyticsRepo.setE1rmFormula('brzycki');
    expect(await analyticsRepo.e1rmFormula()).toBe('brzycki');
  });
});

describe('analyticsRepo.trainingData', () => {
  it('returns hard sets of finished workouts only, with their exercises', async () => {
    const e = await exerciseRepo.create(ex);
    await session(e.id, '2026-04-01', 135);
    await session(e.id, '2026-04-08', 140, false);
    const d = await analyticsRepo.trainingData();
    expect(d.sets).toHaveLength(1);
    expect(d.exercises.get(e.id)?.name).toBe('Bench');
    expect(d.unit).toBe('lb');
  });
});
