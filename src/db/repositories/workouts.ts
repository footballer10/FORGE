import { applySuggestion, draftsFromTargets } from '../../domain/routine';
import { suggestProgression } from '../../domain/progression';
import type { ID, RoutineExercise, SetEntry, Workout, WorkoutExercise, WeightUnit } from '../../domain/types';
import { db } from '../schema';
import { createRepo, nowIso, type NewEntity } from './base';
import { undoRepo } from './undo';

export interface FullWorkout {
  workout: Workout;
  exercises: (WorkoutExercise & { sets: SetEntry[] })[];
}

const workoutBase = createRepo(db.workouts);
const workoutExerciseBase = createRepo(db.workoutExercises);
const setBase = createRepo(db.sets);

/**
 * Workouts with their exercises and sets. Every mutation writes through immediately
 * (crash safety): there is no in-memory-only workout state.
 */
export const workoutRepo = {
  ...workoutBase,

  /** Most recent workout with no endedAt that is not deleted. */
  async getActive(): Promise<Workout | undefined> {
    const open = await db.workouts.filter((w) => !w.endedAt && !w.deletedAt).toArray();
    return open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  },

  /** Move a workout to the trash and record an undo entry. */
  async deleteUndoable(id: ID, label = 'Deleted workout'): Promise<void> {
    // A planned session linked to this workout goes back to "not done" (undo restores the link).
    const linked = await db.plannedSessions.where('completedWorkoutId').equals(id).primaryKeys();
    await undoRepo.run(label, { workouts: [id], plannedSessions: linked }, async () => {
      await workoutBase.softDelete(id);
      const t = nowIso();
      for (const sid of linked) await db.plannedSessions.update(sid, { completedWorkoutId: undefined, updatedAt: t });
    });
  },

  /** Finished workouts with their completed non-warm-up set count, for the calendar and heatmap. */
  async dayStatsInput(sinceIso?: string): Promise<{ id: ID; startedAt: string; hardSets: number }[]> {
    const workouts = await db.workouts
      .filter((w) => !!w.endedAt && !w.deletedAt && (!sinceIso || w.startedAt >= sinceIso))
      .toArray();
    const ids = new Set(workouts.map((w) => w.id));
    const counts = new Map<ID, number>();
    await db.sets
      .filter((s) => !s.deletedAt && !!s.completedAt && s.type !== 'warmup' && ids.has(s.workoutId))
      .each((s) => counts.set(s.workoutId, (counts.get(s.workoutId) ?? 0) + 1));
    return workouts.map((w) => ({ id: w.id, startedAt: w.startedAt, hardSets: counts.get(w.id) ?? 0 }));
  },

  start(input: Partial<NewEntity<Workout>> = {}): Promise<Workout> {
    return workoutBase.create({ name: 'Workout', kind: 'strength', startedAt: nowIso(), ...input });
  },

  /**
   * New in-progress workout from a routine or planned session. Exercises deleted since are skipped. Each exercise gets
   * sets built from its targets (weights from the last session where the target has none) and keeps
   * the targets and rest override for display while logging.
   */
  async startFromPlan(
    plan: { name: string; exercises: RoutineExercise[]; routineId?: ID; plannedSessionId?: ID },
    fallbackUnit: WeightUnit,
  ): Promise<Workout> {
    const w = await workoutBase.create({
      name: plan.name,
      kind: 'strength',
      startedAt: nowIso(),
      ...(plan.routineId ? { routineId: plan.routineId } : {}),
      ...(plan.plannedSessionId ? { plannedSessionId: plan.plannedSessionId } : {}),
    });
    const ordered = [...plan.exercises].sort((a, b) => a.order - b.order);
    for (const re of ordered) {
      const ex = await db.exercises.get(re.exerciseId);
      if (!ex || ex.deletedAt) continue;
      const last = await workoutRepo.lastSetsFor(re.exerciseId, w.id);
      const firstWork = re.targets.find((t) => t.type !== 'warmup');
      const suggestion = re.progression
        ? suggestProgression({
            rule: re.progression,
            ...(firstWork?.reps !== undefined ? { targetReps: firstWork.reps } : {}),
            last,
            increment: { value: ex.weightIncrement, unit: ex.incrementUnit },
          })
        : undefined;
      const we = await workoutRepo.addExercise(w.id, re.exerciseId, {
        ...(re.supersetGroup ? { supersetGroup: re.supersetGroup } : {}),
        ...(re.notes ? { notes: re.notes } : {}),
        ...(re.restSec !== undefined ? { restSec: re.restSec } : {}),
        ...(re.targets.length > 0 ? { targets: re.targets } : {}),
        ...(suggestion ? { progressionNote: `Suggested ${suggestion.summary}. ${suggestion.reason}` } : {}),
      });
      let drafts = draftsFromTargets(re.targets, last, fallbackUnit);
      if (suggestion) drafts = applySuggestion(drafts, re.targets.length > 0 ? re.targets : [{ type: 'working' }], suggestion);
      for (const draft of drafts) await workoutRepo.addSet(we.id, draft);
    }
    return w;
  },

  startFromRoutine(routine: { id: ID; name: string; exercises: RoutineExercise[] }, fallbackUnit: WeightUnit): Promise<Workout> {
    return workoutRepo.startFromPlan({ name: routine.name, exercises: routine.exercises, routineId: routine.id }, fallbackUnit);
  },

  finish(id: ID): Promise<Workout> {
    return workoutBase.update(id, { endedAt: nowIso(), restTimerEndsAt: undefined });
  },

  /** Finished, non-deleted workouts, newest first. */
  async listHistory(limit = 50, offset = 0): Promise<Workout[]> {
    return db.workouts
      .orderBy('startedAt')
      .reverse()
      .filter((w) => !!w.endedAt && !w.deletedAt)
      .offset(offset)
      .limit(limit)
      .toArray();
  },

  async getFull(id: ID): Promise<FullWorkout | undefined> {
    const workout = await db.workouts.get(id);
    if (!workout) return undefined;
    const [wes, sets] = await Promise.all([
      db.workoutExercises.where('workoutId').equals(id).toArray(),
      db.sets.where('workoutId').equals(id).toArray(),
    ]);
    const exercises = wes
      .filter((we) => !we.deletedAt)
      .sort((a, b) => a.order - b.order)
      .map((we) => ({
        ...we,
        sets: sets.filter((s) => s.workoutExerciseId === we.id && !s.deletedAt).sort((a, b) => a.order - b.order),
      }));
    return { workout, exercises };
  },

  async addExercise(workoutId: ID, exerciseId: ID, extra: Partial<WorkoutExercise> = {}): Promise<WorkoutExercise> {
    // max+1 rather than count: removing an exercise leaves a gap in `order`.
    const live = await db.workoutExercises.where('workoutId').equals(workoutId).filter((we) => !we.deletedAt).toArray();
    const order = live.reduce((m, we) => Math.max(m, we.order + 1), 0);
    return workoutExerciseBase.create({ workoutId, exerciseId, order, ...extra });
  },

  /**
   * New in-progress workout with the same exercises, supersets and set structure (type, weight,
   * reps, duration, distance) as `id`, nothing ticked off. Notes, RPE and RIR are not copied.
   */
  async duplicate(id: ID): Promise<Workout | undefined> {
    const src = await workoutRepo.getFull(id);
    if (!src) return undefined;
    const w = await workoutBase.create({ name: src.workout.name, kind: src.workout.kind, startedAt: nowIso() });
    for (const e of src.exercises) {
      const we = await workoutExerciseBase.create({
        workoutId: w.id,
        exerciseId: e.exerciseId,
        order: e.order,
        ...(e.supersetGroup ? { supersetGroup: e.supersetGroup } : {}),
      });
      for (const s of e.sets) {
        await setBase.create({
          workoutExerciseId: we.id,
          workoutId: w.id,
          exerciseId: e.exerciseId,
          order: s.order,
          type: s.type,
          unit: s.unit,
          ...(s.weight !== undefined ? { weight: s.weight } : {}),
          ...(s.reps !== undefined ? { reps: s.reps } : {}),
          ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
          ...(s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
        });
      }
    }
    return w;
  },

  /** Persist a new exercise order: `orderedIds` are WorkoutExercise IDs, first = position 0. */
  async reorderExercises(orderedIds: ID[]): Promise<void> {
    await db.transaction('rw', db.workoutExercises, async () => {
      for (const [order, id] of orderedIds.entries()) {
        const we = await db.workoutExercises.get(id);
        if (we && we.order !== order) await workoutExerciseBase.update(id, { order });
      }
    });
  },

  /**
   * Swap the exercise of a workout exercise. Existing sets are soft-deleted (the caller refuses
   * the swap once sets are completed), so no logged data is lost or attributed to the wrong lift.
   */
  async replaceExercise(workoutExerciseId: ID, exerciseId: ID): Promise<WorkoutExercise> {
    await db.transaction('rw', db.workoutExercises, db.sets, async () => {
      const sets = await db.sets.where('workoutExerciseId').equals(workoutExerciseId).filter((s) => !s.deletedAt).toArray();
      for (const s of sets) await setBase.softDelete(s.id);
    });
    return workoutExerciseBase.update(workoutExerciseId, { exerciseId });
  },

  updateExercise: workoutExerciseBase.update,
  removeExercise: workoutExerciseBase.softDelete,

  async addSet(workoutExerciseId: ID, input: Partial<SetEntry> = {}): Promise<SetEntry> {
    const we = await db.workoutExercises.get(workoutExerciseId);
    if (!we) throw new Error(`Not found: workoutExercises/${workoutExerciseId}`);
    const count = await db.sets.where('workoutExerciseId').equals(workoutExerciseId).filter((s) => !s.deletedAt).count();
    return setBase.create({
      type: 'working',
      unit: 'lb',
      order: count,
      ...input,
      workoutExerciseId,
      workoutId: we.workoutId,
      exerciseId: we.exerciseId,
    });
  },

  updateSet: setBase.update,
  removeSet: setBase.softDelete,

  /**
   * Sets from the most recent finished workout containing this exercise, for prefill.
   * Excludes the given workout (usually the active one).
   */
  async lastSetsFor(exerciseId: ID, excludeWorkoutId?: ID): Promise<SetEntry[]> {
    const all = await db.sets
      .where('exerciseId')
      .equals(exerciseId)
      .filter((s) => !s.deletedAt && !!s.completedAt && s.workoutId !== excludeWorkoutId)
      .toArray();
    // Sets of trashed workouts must not feed prefill (or, later, analytics).
    const workoutIds = [...new Set(all.map((s) => s.workoutId))];
    const trashed = new Set((await db.workouts.bulkGet(workoutIds)).filter((w) => !w || w.deletedAt).map((w) => w?.id));
    const sets = all.filter((s) => !trashed.has(s.workoutId));
    if (sets.length === 0) return [];
    const latest = sets.reduce((a, b) => ((a.completedAt ?? '') > (b.completedAt ?? '') ? a : b));
    return sets.filter((s) => s.workoutId === latest.workoutId).sort((a, b) => a.order - b.order);
  },
};
