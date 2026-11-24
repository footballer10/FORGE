import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, exerciseRepo, workoutRepo } from '../../db/repositories';
import { useWorkout } from './workoutStore';

const base = {
  aliases: [], equipment: 'barbell' as const, primaryMuscles: ['chest' as const], secondaryMuscles: [],
  pattern: 'horizontalPush' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5,
  incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const,
};

beforeEach(async () => {
  await clearAllData();
  useWorkout.setState({ loaded: false, workout: undefined, rows: [] });
});

const sets = () => useWorkout.getState().rows[0]!.sets;

describe('workout store', () => {
  it('starts, adds an exercise with one empty set, edits, completes, finishes', async () => {
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    const st = useWorkout.getState();
    await st.start();
    await useWorkout.getState().addExercise(bench.id);
    expect(sets()).toHaveLength(1);

    const id = sets()[0]!.id;
    expect(await useWorkout.getState().toggleComplete(id)).toBe(false); // no reps yet
    await useWorkout.getState().updateSet(id, { weight: 135, reps: 5 });
    expect(await useWorkout.getState().toggleComplete(id)).toBe(true);
    expect(sets()[0]?.completedAt).toBeTruthy();

    await useWorkout.getState().addSet(useWorkout.getState().rows[0]!.we.id);
    expect(sets()[1]).toMatchObject({ weight: 135, reps: 5, type: 'working' }); // copies previous set

    expect(await useWorkout.getState().finish()).toBe(true);
    const hist = await workoutRepo.listHistory();
    expect(hist).toHaveLength(1);
    const full = await workoutRepo.getFull(hist[0]!.id);
    expect(full?.exercises[0]?.sets).toHaveLength(1); // unticked set dropped
  });

  it('persists immediately: a reload resumes the workout with edits', async () => {
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    const id = sets()[0]!.id;
    await useWorkout.getState().updateSet(id, { weight: 200, reps: 3 });
    await useWorkout.getState().toggleComplete(id);

    useWorkout.setState({ loaded: false, workout: undefined, rows: [] }); // simulate app restart
    await useWorkout.getState().load();
    expect(useWorkout.getState().workout).toBeTruthy();
    expect(sets()[0]).toMatchObject({ weight: 200, reps: 3 });
    expect(sets()[0]?.completedAt).toBeTruthy();
  });

  it('prefills the next session from the last one', async () => {
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    const we = useWorkout.getState().rows[0]!.we.id;
    await useWorkout.getState().addSet(we);
    for (const s of sets()) {
      await useWorkout.getState().updateSet(s.id, { weight: 185, reps: 5 });
      await useWorkout.getState().toggleComplete(s.id);
    }
    await useWorkout.getState().finish();

    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    expect(sets().map((s) => [s.weight, s.reps, s.completedAt])).toEqual([[185, 5, undefined], [185, 5, undefined]]);
    expect(useWorkout.getState().rows[0]?.last).toHaveLength(2);
  });

  it('finish refuses an empty workout; discard removes it from history and resume', async () => {
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    expect(await useWorkout.getState().finish()).toBe(false);
    await useWorkout.getState().discard();
    expect(useWorkout.getState().workout).toBeUndefined();
    expect(await workoutRepo.getActive()).toBeUndefined();
    expect(await workoutRepo.listHistory()).toHaveLength(0);
  });

  it('removes an exercise', async () => {
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    await useWorkout.getState().removeExercise(useWorkout.getState().rows[0]!.we.id);
    expect(useWorkout.getState().rows).toHaveLength(0);
  });
});
