import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bodyRepo, clearAllData, coachRepo, exerciseRepo, profileRepo, workoutRepo } from './index';

const ex = { name: 'Bench', aliases: [], equipment: 'barbell' as const, primaryMuscles: ['chest' as const], secondaryMuscles: ['triceps' as const], pattern: 'horizontalPush' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const };

async function session(exerciseId: string, day: string, weight: number) {
  const w = await workoutRepo.start({ startedAt: `${day}T10:00:00.000Z` });
  const we = await workoutRepo.addExercise(w.id, exerciseId);
  await workoutRepo.addSet(we.id, { weight, reps: 5, completedAt: `${day}T10:30:00.000Z` });
  await workoutRepo.addSet(we.id, { weight, reps: 5, completedAt: `${day}T10:40:00.000Z` });
  await workoutRepo.addSet(we.id, { type: 'warmup', weight: 45, reps: 10, completedAt: `${day}T10:20:00.000Z` });
  await workoutRepo.finish(w.id);
}

beforeEach(clearAllData);

describe('coachRepo.summaryText', () => {
  it('summarises the window, ignoring warm-ups and sessions outside it', async () => {
    const e = await exerciseRepo.create(ex);
    await session(e.id, '2026-09-01', 130); // before the window
    await session(e.id, '2026-11-03', 135);
    await session(e.id, '2026-11-17', 145);
    await bodyRepo.add('2026-11-20', 180, 'lb');
    await profileRepo.update({ constraints: ['Sore left shoulder'] });
    const input = await coachRepo.summaryInput(56, '2026-11-24');
    expect(input.sessions).toBe(2);
    expect(input.hardSets).toBe(4);
    expect(input.lifts).toHaveLength(1);
    expect(input.lifts[0]!.sets).toBe(4);
    expect(input.lifts[0]!.e1rmBefore).toBeDefined();
    expect(input.prs.some((p) => p.kind === 'rep' && p.value === 145 && p.previous === 135)).toBe(true);
    expect(input.muscleSetsPerWeek.find((m) => m.muscle === 'chest')!.sets).toBe(0.5); // 4 sets over 8 weeks
    const text = await coachRepo.summaryText(56, '2026-11-24');
    expect(text).toContain('Sore left shoulder');
    expect(text).toContain('Bench: 4 sets');
    expect(text).toContain('180 lb on 2026-11-20');
  });

  it('works with no data at all', async () => {
    const text = await coachRepo.summaryText(28, '2026-11-24');
    expect(text).toContain('Hard sets (completed, non-warm-up): 0');
    expect(text).toContain('no active program');
  });
});
