import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { achievementsRepo, clearAllData, exerciseRepo, profileRepo, workoutRepo } from './index';

const ex = { name: 'Bench', aliases: [], equipment: 'barbell' as const, primaryMuscles: [], secondaryMuscles: [], pattern: 'horizontalPush' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const };

async function session(exerciseId: string, day: string, weight: number) {
  const w = await workoutRepo.start({ startedAt: `${day}T10:00:00.000Z` });
  const we = await workoutRepo.addExercise(w.id, exerciseId);
  await workoutRepo.addSet(we.id, { weight, reps: 5, completedAt: `${day}T10:30:00.000Z` });
  await workoutRepo.finish(w.id);
  return w;
}

beforeEach(clearAllData);

describe('achievementsRepo.sync', () => {
  it('stores earned achievements once and marks them seen', async () => {
    const e = await exerciseRepo.create(ex);
    await profileRepo.update({ strengthScoreLifts: [{ exerciseId: e.id, weight: 1 }] });
    await session(e.id, '2026-04-01', 135);
    await session(e.id, '2026-04-08', 140);
    const first = await achievementsRepo.sync();
    const keys = first.map((a) => a.key);
    expect(keys).toContain('workouts-1');
    expect(keys).toContain('prs-1');
    expect(keys).toContain(`lift-${e.id}-135`);
    expect(first.find((a) => a.key === 'workouts-1')?.title).toBe('First workout');
    expect(await achievementsRepo.sync()).toEqual([]);
    const unseen = await achievementsRepo.unseen();
    expect(unseen).toHaveLength(first.length);
    await achievementsRepo.markSeen(unseen.map((a) => a.id));
    expect(await achievementsRepo.unseen()).toEqual([]);
  });

  it('ignores trashed and unfinished workouts', async () => {
    const e = await exerciseRepo.create(ex);
    const w = await session(e.id, '2026-04-01', 135);
    await workoutRepo.softDelete(w.id);
    expect(await achievementsRepo.sync()).toEqual([]);
  });
});
