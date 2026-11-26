import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { analyticsRepo, clearAllData, exerciseRepo, workoutRepo } from '../../db/repositories';
import { bestByDistance, conditioningRows } from '../../domain/conditioning';
import { useWorkout } from './workoutStore';

const base = {
  aliases: [], equipment: 'barbell' as const, primaryMuscles: ['chest' as const], secondaryMuscles: [],
  pattern: 'horizontalPush' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5,
  incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const,
};

beforeEach(async () => {
  await clearAllData();
  useWorkout.setState({ loaded: false, workout: undefined, rows: [], restEndsAt: undefined, restTotalSec: undefined });
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

  it('starts a conditioning session with that kind', async () => {
    await useWorkout.getState().start('conditioning');
    expect(useWorkout.getState().workout).toMatchObject({ kind: 'conditioning', name: 'Conditioning' });
  });

  it('a finished conditioning session shows up in the conditioning data', async () => {
    const run = await exerciseRepo.create({ ...base, name: 'Run', loadModel: 'timeDistance', equipment: 'bodyweight' });
    await useWorkout.getState().start('conditioning');
    await useWorkout.getState().addExercise(run.id);
    const id = sets()[0]!.id;
    await useWorkout.getState().updateSet(id, { durationSec: 70, distanceM: 400 });
    expect(await useWorkout.getState().toggleComplete(id)).toBe(true);
    expect(await useWorkout.getState().finish()).toBe(true);
    const d = await analyticsRepo.trainingData();
    const rows = conditioningRows(d.sets, d.exercises, d.workouts);
    expect(rows).toHaveLength(1);
    expect(bestByDistance(rows, run.id)[0]).toMatchObject({ distanceM: 400, bestTimeSec: 70 });
  });

  it('persists immediately: a reload resumes the workout with edits', async () => {
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    const id = sets()[0]!.id;
    await useWorkout.getState().updateSet(id, { weight: 200, reps: 3 });
    await useWorkout.getState().toggleComplete(id);

    useWorkout.setState({ loaded: false, workout: undefined, rows: [], restEndsAt: undefined, restTotalSec: undefined }); // simulate app restart
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

  describe('rest timer', () => {
    const tick = async (reps = 5) => {
      const st = useWorkout.getState();
      const id = st.rows[0]!.sets[0]!.id;
      await st.updateSet(id, { weight: 100, reps });
      await useWorkout.getState().toggleComplete(id);
      return id;
    };

    it('starts on completing a working set with the exercise rest, and persists the end time', async () => {
      const bench = await exerciseRepo.create({ ...base, name: 'Bench', defaultRestSec: 90 });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(bench.id);
      const before = Date.now();
      await tick();
      const ends = Date.parse(useWorkout.getState().restEndsAt!);
      expect(ends - before).toBeGreaterThanOrEqual(89_000);
      expect(ends - before).toBeLessThan(91_500);
      expect((await workoutRepo.getActive())?.restTimerEndsAt).toBe(useWorkout.getState().restEndsAt);
    });

    it('starts for warm-ups too (capped at 60 s), restarts on the next set; skip clears it', async () => {
      const bench = await exerciseRepo.create({ ...base, name: 'Bench', defaultRestSec: 180 });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(bench.id);
      await useWorkout.getState().updateSet(sets()[0]!.id, { type: 'warmup' });
      let before = Date.now();
      await tick();
      expect(useWorkout.getState().restTotalSec).toBe(60);
      expect(Date.parse(useWorkout.getState().restEndsAt!) - before).toBeLessThan(61_500);

      // Ticking the next (working) set replaces the running timer with the full rest.
      await useWorkout.getState().addSet(useWorkout.getState().rows[0]!.we.id);
      await useWorkout.getState().updateSet(sets()[1]!.id, { weight: 100, reps: 5 });
      before = Date.now();
      await useWorkout.getState().toggleComplete(sets()[1]!.id);
      expect(useWorkout.getState().restTotalSec).toBe(180);
      expect(Date.parse(useWorkout.getState().restEndsAt!) - before).toBeGreaterThan(179_000);

      await useWorkout.getState().startRest(60);
      expect(useWorkout.getState().restEndsAt).toBeTruthy();
      await useWorkout.getState().skipRest();
      expect(useWorkout.getState().restEndsAt).toBeUndefined();
      expect((await workoutRepo.getActive())?.restTimerEndsAt).toBeUndefined();
    });

    it('adjusts by 15 s', async () => {
      const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(bench.id);
      await useWorkout.getState().startRest(60);
      const a = Date.parse(useWorkout.getState().restEndsAt!);
      await useWorkout.getState().adjustRest(15);
      expect(Date.parse(useWorkout.getState().restEndsAt!) - a).toBe(15_000);
    });

    it('resumes a running timer after reload, but drops a stale one', async () => {
      const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(bench.id);
      await useWorkout.getState().startRest(120);
      const ends = useWorkout.getState().restEndsAt;
      useWorkout.setState({ loaded: false, workout: undefined, rows: [], restEndsAt: undefined });
      await useWorkout.getState().load();
      expect(useWorkout.getState().restEndsAt).toBe(ends);

      const w = (await workoutRepo.getActive())!;
      await workoutRepo.update(w.id, { restTimerEndsAt: new Date(Date.now() - 600_000).toISOString() });
      await useWorkout.getState().load();
      expect(useWorkout.getState().restEndsAt).toBeUndefined();
      expect((await workoutRepo.getActive())?.restTimerEndsAt).toBeUndefined();
    });
  });

  describe('notes', () => {
    it('saves session notes, per-session exercise notes, and a sticky note on the exercise', async () => {
      const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(bench.id);
      const weId = useWorkout.getState().rows[0]!.we.id;
      await useWorkout.getState().setWorkoutNotes('Felt slow');
      await useWorkout.getState().setExerciseNote(weId, 'Left shoulder tight');
      await useWorkout.getState().setStickyNote(bench.id, 'Seat 4, grip on rings');
      expect((await workoutRepo.getActive())?.notes).toBe('Felt slow');
      expect(useWorkout.getState().rows[0]?.we.notes).toBe('Left shoulder tight');
      expect((await exerciseRepo.get(bench.id))?.stickyNote).toBe('Seat 4, grip on rings');
      expect(useWorkout.getState().rows[0]?.exercise.stickyNote).toBe('Seat 4, grip on rings');

      await useWorkout.getState().setWorkoutNotes('');
      expect((await workoutRepo.getActive())?.notes).toBeUndefined();
    });
  });

  describe('reorder and swap', () => {
    it('moves exercises up/down and persists order; new exercise after a removal does not collide', async () => {
      const a = await exerciseRepo.create({ ...base, name: 'A' });
      const b = await exerciseRepo.create({ ...base, name: 'B' });
      const c = await exerciseRepo.create({ ...base, name: 'C' });
      await useWorkout.getState().start();
      for (const e of [a, b, c]) await useWorkout.getState().addExercise(e.id);
      const names = () => useWorkout.getState().rows.map((r) => r.exercise.name);
      const idOf = (n: string) => useWorkout.getState().rows.find((r) => r.exercise.name === n)!.we.id;

      await useWorkout.getState().moveExercise(idOf('C'), -1);
      expect(names()).toEqual(['A', 'C', 'B']);
      await useWorkout.getState().moveExercise(idOf('A'), -1); // already first: no-op
      expect(names()).toEqual(['A', 'C', 'B']);

      useWorkout.setState({ rows: [] });
      await useWorkout.getState().load();
      expect(names()).toEqual(['A', 'C', 'B']);

      // Drag and drop applies a whole new order; bad input (missing or unknown ids) is ignored.
      await useWorkout.getState().setExerciseOrder([idOf('B'), idOf('A'), idOf('C')]);
      expect(names()).toEqual(['B', 'A', 'C']);
      await useWorkout.getState().setExerciseOrder([idOf('A')]);
      await useWorkout.getState().setExerciseOrder(['nope', idOf('A'), idOf('C')]);
      expect(names()).toEqual(['B', 'A', 'C']);
      await useWorkout.getState().setExerciseOrder([idOf('A'), idOf('C'), idOf('B')]);
      expect(names()).toEqual(['A', 'C', 'B']);

      await useWorkout.getState().removeExercise(idOf('C'));
      const d = await exerciseRepo.create({ ...base, name: 'D' });
      await useWorkout.getState().addExercise(d.id);
      expect(names()).toEqual(['A', 'B', 'D']);
    });

    it('swaps an exercise with no completed sets and re-prefills from the new one', async () => {
      const a = await exerciseRepo.create({ ...base, name: 'A' });
      const b = await exerciseRepo.create({ ...base, name: 'B' });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(a.id);
      const weId = useWorkout.getState().rows[0]!.we.id;
      expect(await useWorkout.getState().swapExercise(weId, b.id)).toBe(true);
      const row = useWorkout.getState().rows[0]!;
      expect(row.exercise.name).toBe('B');
      expect(row.sets).toHaveLength(1);
      expect(row.sets[0]?.exerciseId).toBe(b.id);
    });

    it('refuses to swap once a set is completed', async () => {
      const a = await exerciseRepo.create({ ...base, name: 'A' });
      const b = await exerciseRepo.create({ ...base, name: 'B' });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(a.id);
      const id = sets()[0]!.id;
      await useWorkout.getState().updateSet(id, { weight: 100, reps: 5 });
      await useWorkout.getState().toggleComplete(id);
      expect(await useWorkout.getState().swapExercise(useWorkout.getState().rows[0]!.we.id, b.id)).toBe(false);
      expect(useWorkout.getState().rows[0]?.exercise.name).toBe('A');
    });
  });

  describe('supersets', () => {
    it('rests only after the last exercise of the round', async () => {
      const a = await exerciseRepo.create({ ...base, name: 'A' });
      const b = await exerciseRepo.create({ ...base, name: 'B' });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(a.id);
      await useWorkout.getState().addExercise(b.id);
      await useWorkout.getState().toggleSuperset(useWorkout.getState().rows[0]!.we.id);
      expect(useWorkout.getState().rows.map((r) => r.we.supersetGroup)).toEqual(['A', 'A']);

      const tickRow = async (i: number) => {
        const sid = useWorkout.getState().rows[i]!.sets[0]!.id;
        await useWorkout.getState().updateSet(sid, { weight: 50, reps: 8 });
        await useWorkout.getState().toggleComplete(sid);
      };
      await tickRow(0);
      expect(useWorkout.getState().restEndsAt).toBeUndefined();
      await tickRow(1);
      expect(useWorkout.getState().restEndsAt).toBeTruthy();

      await useWorkout.getState().toggleSuperset(useWorkout.getState().rows[0]!.we.id); // unlink
      expect(useWorkout.getState().rows.map((r) => r.we.supersetGroup)).toEqual([undefined, undefined]);
    });
  });

  describe('past workouts', () => {
    const logOne = async () => {
      const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
      await useWorkout.getState().start();
      await useWorkout.getState().addExercise(bench.id);
      const id = sets()[0]!.id;
      await useWorkout.getState().updateSet(id, { weight: 135, reps: 5 });
      await useWorkout.getState().toggleComplete(id);
      await useWorkout.getState().setWorkoutNotes('keep me');
      await useWorkout.getState().finish();
      return (await workoutRepo.listHistory())[0]!;
    };

    it('edits a finished workout in place, keeps its end time, starts no rest timer, survives reload', async () => {
      const done = await logOne();
      await useWorkout.getState().openPast(done.id);
      expect(useWorkout.getState().workout?.id).toBe(done.id);

      useWorkout.setState({ loaded: false, workout: undefined, rows: [] });
      await useWorkout.getState().load(); // reload mid-edit resumes the edit
      expect(useWorkout.getState().workout?.id).toBe(done.id);

      await useWorkout.getState().updateSet(sets()[0]!.id, { weight: 140 });
      await useWorkout.getState().addSet(useWorkout.getState().rows[0]!.we.id);
      await useWorkout.getState().updateSet(sets()[1]!.id, { weight: 140, reps: 5 });
      await useWorkout.getState().toggleComplete(sets()[1]!.id);
      expect(useWorkout.getState().restEndsAt).toBeUndefined();

      expect(await useWorkout.getState().finish()).toBe(true);
      const after = await workoutRepo.getFull(done.id);
      expect(after?.workout.endedAt).toBe(done.endedAt);
      expect(after?.exercises[0]?.sets.map((s) => s.weight)).toEqual([140, 140]);
      expect(useWorkout.getState().workout).toBeUndefined();
      expect(await workoutRepo.getActive()).toBeUndefined();
      await useWorkout.getState().load();
      expect(useWorkout.getState().workout).toBeUndefined(); // edit mode cleared
    });

    it('closing an edit does not delete the workout', async () => {
      const done = await logOne();
      await useWorkout.getState().openPast(done.id);
      await useWorkout.getState().discard();
      expect((await workoutRepo.listHistory()).map((w) => w.id)).toEqual([done.id]);
    });

    it('duplicates structure without completions or notes, as a new active workout', async () => {
      const done = await logOne();
      expect(await useWorkout.getState().duplicate(done.id)).toBe(true);
      const w = useWorkout.getState().workout!;
      expect(w.id).not.toBe(done.id);
      expect(w.endedAt).toBeUndefined();
      expect(w.notes).toBeUndefined();
      expect(sets().map((s) => [s.weight, s.reps, s.completedAt])).toEqual([[135, 5, undefined]]);
      expect(await useWorkout.getState().duplicate(done.id)).toBe(false); // one active workout at a time
      expect((await workoutRepo.listHistory()).map((x) => x.id)).toEqual([done.id]); // original untouched
    });
  });
});

describe('start from routine', () => {
  it('builds sets from targets, fills weight from history, applies rest override', async () => {
    const { routineRepo } = await import('../../db/repositories');
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    // history: one finished session at 135 x 5
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    const sid = sets()[0]!.id;
    await useWorkout.getState().updateSet(sid, { weight: 135, reps: 5 });
    await useWorkout.getState().toggleComplete(sid);
    await useWorkout.getState().finish();

    const gone = await exerciseRepo.create({ ...base, name: 'Gone' });
    await exerciseRepo.softDelete(gone.id);
    const r = await routineRepo.create({
      name: 'Push A',
      exercises: [
        { exerciseId: gone.id, order: 0, targets: [{ type: 'working', reps: 5 }] },
        { exerciseId: bench.id, order: 1, restSec: 60, targets: [{ type: 'working', reps: 6, repsMax: 8, rpe: 8 }, { type: 'working', reps: 6, weight: 150, unit: 'lb' }] },
      ],
    });
    expect(await useWorkout.getState().startFromRoutine(r.id)).toBe(true);
    const st = useWorkout.getState();
    expect(st.workout).toMatchObject({ name: 'Push A', routineId: r.id });
    expect(st.rows).toHaveLength(1);
    expect(st.rows[0]!.we).toMatchObject({ restSec: 60 });
    expect(st.rows[0]!.we.targets).toHaveLength(2);
    expect(sets().map((s) => [s.weight, s.reps])).toEqual([[135, 6], [150, 6]]);
    expect(await useWorkout.getState().startFromRoutine(r.id)).toBe(false); // already active

    await useWorkout.getState().toggleComplete(sets()[0]!.id);
    const secs = Math.round((Date.parse(useWorkout.getState().restEndsAt!) - Date.now()) / 1000);
    expect(secs).toBeGreaterThan(55);
    expect(secs).toBeLessThanOrEqual(60);
  });
});

describe('planned session link', () => {
  it('links on finish, unlinks when the workout is deleted, undo relinks', async () => {
    const { plannedSessionRepo, programRepo, undoRepo } = await import('../../db/repositories');
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    const p = await programRepo.saveVersion({
      fields: { name: 'P' }, reason: 'x',
      weeks: [{ key: 'w', sessions: [{ key: 's', name: 'Push', exercises: [{ exerciseId: bench.id, order: 0, targets: [{ type: 'working', reps: 5 }] }] }] }],
    });
    const ps = (await plannedSessionRepo.list()).find((s) => s.programId === p.id)!;
    expect(await useWorkout.getState().startFromPlanned(ps.id)).toBe(true);
    await useWorkout.getState().toggleComplete(sets()[0]!.id);
    await useWorkout.getState().finish();
    const wid = (await workoutRepo.listHistory())[0]!.id;
    expect((await plannedSessionRepo.get(ps.id))?.completedWorkoutId).toBe(wid);

    await workoutRepo.deleteUndoable(wid);
    expect((await plannedSessionRepo.get(ps.id))?.completedWorkoutId).toBeUndefined();
    await undoRepo.undoLatest();
    expect((await plannedSessionRepo.get(ps.id))?.completedWorkoutId).toBe(wid);

    // undoing the finish unlinks again
    await undoRepo.undoLatest(); // the earlier "Finished workout" entry
    expect((await plannedSessionRepo.get(ps.id))?.completedWorkoutId).toBeUndefined();
  });

  it('dayStatsInput counts completed non-warm-up sets of finished workouts', async () => {
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    const we = useWorkout.getState().rows[0]!.we.id;
    await useWorkout.getState().updateSet(sets()[0]!.id, { reps: 5, type: 'warmup' });
    await useWorkout.getState().toggleComplete(sets()[0]!.id);
    await useWorkout.getState().addSet(we);
    await useWorkout.getState().updateSet(sets()[1]!.id, { reps: 5, type: 'working' });
    await useWorkout.getState().toggleComplete(sets()[1]!.id);
    await useWorkout.getState().finish();
    const stats = await workoutRepo.dayStatsInput();
    expect(stats).toHaveLength(1);
    expect(stats[0]!.hardSets).toBe(1);
  });
});

describe('progression on start', () => {
  it('prefills the suggested weight and reps and records the formula', async () => {
    const { routineRepo } = await import('../../db/repositories');
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    await useWorkout.getState().updateSet(sets()[0]!.id, { weight: 135, reps: 12 });
    await useWorkout.getState().toggleComplete(sets()[0]!.id);
    await useWorkout.getState().finish();

    const r = await routineRepo.create({
      name: 'Push',
      exercises: [{ exerciseId: bench.id, order: 0, progression: { kind: 'doubleProgression', repsMin: 8, repsMax: 12 }, targets: [{ type: 'working', reps: 8, repsMax: 12 }, { type: 'working', reps: 8, repsMax: 12, weight: 100, unit: 'lb' }] }],
    });
    await useWorkout.getState().startFromRoutine(r.id);
    expect(sets().map((s) => [s.weight, s.reps])).toEqual([[140, 8], [100, 8]]); // fixed target weight wins
    const we = useWorkout.getState().rows[0]!.we;
    expect(we.progressionNote).toMatch(/^All 1 set/);
    expect(we.suggested).toEqual({ weight: 140, unit: 'lb', reps: 8 });
  });

  it('uses the rest typed for each set in the routine (warm-ups included), else the exercise rest', async () => {
    const { routineRepo } = await import('../../db/repositories');
    const sq = await exerciseRepo.create({ ...base, name: 'Squat', defaultRestSec: 120 });
    const r = await routineRepo.create({
      name: 'Legs',
      exercises: [{
        exerciseId: sq.id, order: 0,
        targets: [
          { type: 'warmup', reps: 8, weight: 45, unit: 'lb', restSec: 60 },
          { type: 'warmup', reps: 3, weight: 135, unit: 'lb', restSec: 90 },
          { type: 'working', reps: 6, weight: 200, unit: 'lb', restSec: 180 },
          { type: 'working', reps: 6, weight: 200, unit: 'lb' },
        ],
      }],
    });
    await useWorkout.getState().startFromRoutine(r.id);
    const restAfter = async (i: number) => {
      await useWorkout.getState().toggleComplete(sets()[i]!.id);
      return useWorkout.getState().restTotalSec;
    };
    expect(await restAfter(0)).toBe(60);
    expect(await restAfter(1)).toBe(90);
    expect(await restAfter(2)).toBe(180);
    expect(await restAfter(3)).toBe(120); // no per-set rest: the exercise default
  });

  it('addWarmups puts the ramp before the working sets, once', async () => {
    const sq = await exerciseRepo.create({ ...base, name: 'Squat' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(sq.id);
    await useWorkout.getState().updateSet(sets()[0]!.id, { weight: 225, reps: 5 });
    const weId = useWorkout.getState().rows[0]!.we.id;
    await useWorkout.getState().addWarmups(weId, 45, [45, 35, 25, 10, 5, 2.5]);
    // The inserted ramp is then filled by the automatic rule for 4 warm-ups: bar, 60%, 75%, 90% on the easiest plates.
    expect(sets().map((s) => [s.type, s.weight, s.reps])).toEqual([['warmup', 45, 10], ['warmup', 135, 5], ['warmup', 165, 3], ['warmup', 205, 1], ['working', 225, 5]]);
    await useWorkout.getState().addWarmups(weId, 45, [45, 35, 25, 10, 5, 2.5]);
    expect(sets()).toHaveLength(5);
  });

  it('auto-fills warm-up weights from the working weight, follows it, and leaves typed or done warm-ups alone', async () => {
    const { routineRepo } = await import('../../db/repositories');
    const sq = await exerciseRepo.create({ ...base, name: 'Squat', equipment: 'barbell', loadModel: 'total' });
    const r = await routineRepo.create({
      name: 'Legs',
      exercises: [{ exerciseId: sq.id, order: 0, targets: [
        { type: 'warmup', reps: 8 }, { type: 'warmup', reps: 8 }, { type: 'warmup', reps: 3 }, { type: 'warmup', reps: 2 }, { type: 'warmup', reps: 1 },
        { type: 'working', reps: 6, weight: 205, unit: 'lb' },
      ] }],
    });
    await useWorkout.getState().startFromRoutine(r.id);
    const weights = () => sets().map((s) => s.weight);
    expect(weights()).toEqual([45, 95, 115, 155, 185, 205]);
    expect(sets().map((s) => s.reps)).toEqual([8, 8, 3, 2, 1, 6]); // reps from the routine are kept

    // Raise the working weight: warm-ups follow.
    await useWorkout.getState().updateSet(sets()[5]!.id, { weight: 225 });
    expect(weights()).toEqual([45, 95, 115, 165, 205, 225]); // 115 is one 35 a side

    // A warm-up the user typed and one already done stay as they are.
    await useWorkout.getState().updateSet(sets()[1]!.id, { weight: 100 });
    await useWorkout.getState().toggleComplete(sets()[0]!.id);
    await useWorkout.getState().updateSet(sets()[5]!.id, { weight: 185 });
    expect(weights()[0]).toBe(45);
    expect(weights()[1]).toBe(100);
    expect(weights().slice(2)).toEqual([95, 135, 165, 185]);

    // Turned off: nothing changes.
    await useWorkout.getState().setAutoWarmup(false);
    await useWorkout.getState().updateSet(sets()[5]!.id, { weight: 275 });
    expect(weights().slice(2, 5)).toEqual([95, 135, 165]);
    await useWorkout.getState().setAutoWarmup(true);
  });

  it('starts a conditioning preset with distances and per-effort rests, creating the Run exercise once', async () => {
    const { CONDITIONING_PRESETS } = await import('../../domain/conditioningPresets');
    const intervals = CONDITIONING_PRESETS.find((p) => p.id === 'intervals-400m')!;
    expect(await useWorkout.getState().startConditioningPreset(intervals)).toBe(true);
    const st = useWorkout.getState();
    expect(st.workout).toMatchObject({ name: 'Intervals', kind: 'conditioning' });
    expect(st.rows[0]!.exercise).toMatchObject({ name: 'Run', loadModel: 'timeDistance' });
    expect(sets().map((s) => s.distanceM)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(await useWorkout.getState().startConditioningPreset(intervals)).toBe(false); // one already open
    await useWorkout.getState().updateSet(sets()[0]!.id, { durationSec: 75 });
    await useWorkout.getState().toggleComplete(sets()[0]!.id);
    expect(useWorkout.getState().restTotalSec).toBe(90);
    await useWorkout.getState().discard();
    await useWorkout.getState().startConditioningPreset(intervals);
    expect((await exerciseRepo.list()).filter((e) => e.name === 'Run')).toHaveLength(1);
  });

  it('fillSuggested fills the next open working set only', async () => {
    const bench = await exerciseRepo.create({ ...base, name: 'Bench' });
    await useWorkout.getState().start();
    await useWorkout.getState().addExercise(bench.id);
    const st = useWorkout.getState();
    const weId = st.rows[0]!.we.id;
    useWorkout.setState({ rows: st.rows.map((r) => ({ ...r, we: { ...r.we, suggested: { weight: 150, unit: 'lb', reps: 6 } } })) });
    await useWorkout.getState().fillSuggested(weId);
    expect(sets().map((s) => [s.weight, s.reps])).toEqual([[150, 6]]);
  });
});
