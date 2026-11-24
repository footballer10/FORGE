import { create } from 'zustand';
import { exerciseRepo, nowIso, profileRepo, workoutRepo } from '../../db/repositories';
import { canComplete, prefillDrafts } from '../../domain/logging';
import { moveItem } from '../../domain/order';
import { adjustRest, isStale, restEndsAt, restSecondsFor } from '../../domain/restTimer';
import type { Exercise, ID, SetEntry, WeightUnit, Workout, WorkoutExercise } from '../../domain/types';

export interface ExerciseRow {
  we: WorkoutExercise;
  exercise: Exercise;
  sets: SetEntry[];
  /** Sets from the previous finished session of this exercise, for the "previous" hint. */
  last: SetEntry[];
}

interface State {
  loaded: boolean;
  workout?: Workout;
  rows: ExerciseRow[];
  unit: WeightUnit;
  /** Absolute end of the running rest timer (ISO), if any. Persisted on the workout. */
  restEndsAt?: string;
  /** Length the current rest started with, for the progress bar only. */
  restTotalSec?: number;
  /** Resume an unfinished workout (crash / reopen) or find none. */
  load: () => Promise<void>;
  start: () => Promise<void>;
  addExercise: (exerciseId: ID) => Promise<void>;
  removeExercise: (workoutExerciseId: ID) => Promise<void>;
  addSet: (workoutExerciseId: ID) => Promise<void>;
  updateSet: (setId: ID, patch: Partial<SetEntry>) => Promise<void>;
  /** Tick a set done (needs reps / time) or un-tick it. Returns false when it cannot complete yet. */
  toggleComplete: (setId: ID) => Promise<boolean>;
  removeSet: (setId: ID) => Promise<void>;
  /** Drops unticked sets and empty exercises, then ends the workout. Returns false if nothing was completed. */
  finish: () => Promise<boolean>;
  discard: () => Promise<void>;
  startRest: (seconds: number) => Promise<void>;
  adjustRest: (deltaSec: number) => Promise<void>;
  skipRest: () => Promise<void>;
  setWorkoutNotes: (notes: string) => Promise<void>;
  /** Note for this exercise in this session only. */
  setExerciseNote: (workoutExerciseId: ID, notes: string) => Promise<void>;
  /** Sticky note stored on the exercise itself; shown every time it is logged. */
  setStickyNote: (exerciseId: ID, note: string) => Promise<void>;
  moveExercise: (workoutExerciseId: ID, delta: -1 | 1) => Promise<void>;
  /** Replace an exercise that has no completed sets. Returns false when sets are already done. */
  swapExercise: (workoutExerciseId: ID, newExerciseId: ID) => Promise<boolean>;
}

/**
 * Active-workout state. The database is the source of truth: every action writes through the
 * repository immediately, and the in-memory copy is only a view of it (optimistic for set edits).
 */
export const useWorkout = create<State>((set, get) => {
  const findSet = (setId: ID) => {
    for (const r of get().rows) {
      const s = r.sets.find((x) => x.id === setId);
      if (s) return { row: r, set: s };
    }
    return undefined;
  };

  const patchLocal = (setId: ID, patch: Partial<SetEntry>) =>
    set((st) => ({
      rows: st.rows.map((r) => ({ ...r, sets: r.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) })),
    }));

  /** Rebuild rows from the database. `last` is kept for known exercises and fetched for new ones. */
  async function refresh(workoutId: ID) {
    const full = await workoutRepo.getFull(workoutId);
    if (!full) return set({ workout: undefined, rows: [] });
    const known = new Map(get().rows.map((r) => [r.we.exerciseId, r]));
    const rows = (
      await Promise.all(
        full.exercises.map(async ({ sets, ...we }): Promise<ExerciseRow | undefined> => {
          const prev = known.get(we.exerciseId);
          const exercise = prev?.exercise ?? (await exerciseRepo.get(we.exerciseId));
          if (!exercise) return undefined;
          const last = prev?.last ?? (await workoutRepo.lastSetsFor(we.exerciseId, workoutId));
          return { we, exercise, sets, last };
        }),
      )
    ).filter((r): r is ExerciseRow => !!r);
    set({ workout: full.workout, rows });
  }

  return {
    loaded: false,
    rows: [],
    unit: 'lb',

    async load() {
      const [profile, active] = await Promise.all([profileRepo.get(), workoutRepo.getActive()]);
      set({ unit: profile.weightUnit, rows: [], restEndsAt: undefined, restTotalSec: undefined });
      if (active) {
        await refresh(active.id);
        const ends = active.restTimerEndsAt;
        if (ends && !isStale(ends, Date.now())) set({ restEndsAt: ends });
        else if (ends) await workoutRepo.update(active.id, { restTimerEndsAt: undefined });
      }
      set({ loaded: true });
    },

    async start() {
      if (get().workout) return;
      const w = await workoutRepo.start();
      set({ rows: [] });
      await refresh(w.id);
    },

    async addExercise(exerciseId) {
      const w = get().workout;
      if (!w) return;
      const [we, last] = await Promise.all([
        workoutRepo.addExercise(w.id, exerciseId),
        workoutRepo.lastSetsFor(exerciseId, w.id),
      ]);
      for (const draft of prefillDrafts(last)) {
        await workoutRepo.addSet(we.id, { ...draft, unit: last[0]?.unit ?? get().unit });
      }
      // Seed `last` so refresh does not refetch it.
      const exercise = await exerciseRepo.get(exerciseId);
      if (exercise) set((st) => ({ rows: [...st.rows, { we, exercise, sets: [], last }] }));
      await refresh(w.id);
    },

    async removeExercise(workoutExerciseId) {
      const w = get().workout;
      if (!w) return;
      await workoutRepo.removeExercise(workoutExerciseId);
      set((st) => ({ rows: st.rows.filter((r) => r.we.id !== workoutExerciseId) }));
      await refresh(w.id);
    },

    async addSet(workoutExerciseId) {
      const w = get().workout;
      const row = get().rows.find((r) => r.we.id === workoutExerciseId);
      if (!w || !row) return;
      const index = row.sets.length;
      const src = row.last[index] ?? row.sets[index - 1];
      await workoutRepo.addSet(workoutExerciseId, {
        type: src && src.type !== 'warmup' ? src.type : 'working',
        unit: src?.unit ?? get().unit,
        ...(src?.weight !== undefined ? { weight: src.weight } : {}),
        ...(src?.reps !== undefined ? { reps: src.reps } : {}),
        ...(src?.durationSec !== undefined ? { durationSec: src.durationSec } : {}),
        ...(src?.distanceM !== undefined ? { distanceM: src.distanceM } : {}),
      });
      await refresh(w.id);
    },

    async updateSet(setId, patch) {
      patchLocal(setId, patch);
      await workoutRepo.updateSet(setId, patch);
    },

    async toggleComplete(setId) {
      const found = findSet(setId);
      if (!found) return false;
      if (found.set.completedAt) {
        await get().updateSet(setId, { completedAt: undefined });
        return true;
      }
      if (!canComplete(found.set, found.row.exercise.loadModel)) return false;
      await get().updateSet(setId, { completedAt: nowIso() });
      const sec = restSecondsFor(found.row.exercise, found.set.type);
      if (sec > 0) await get().startRest(sec);
      return true;
    },

    async removeSet(setId) {
      const w = get().workout;
      if (!w) return;
      await workoutRepo.removeSet(setId);
      await refresh(w.id);
    },

    async finish() {
      const w = get().workout;
      if (!w) return false;
      const rows = get().rows;
      if (!rows.some((r) => r.sets.some((s) => s.completedAt))) return false;
      for (const r of rows) {
        const done = r.sets.filter((s) => s.completedAt);
        for (const s of r.sets) if (!s.completedAt) await workoutRepo.removeSet(s.id);
        if (done.length === 0) await workoutRepo.removeExercise(r.we.id);
      }
      await workoutRepo.finish(w.id);
      set({ workout: undefined, rows: [], restEndsAt: undefined, restTotalSec: undefined });
      return true;
    },

    async discard() {
      const w = get().workout;
      if (!w) return;
      await workoutRepo.softDelete(w.id);
      set({ workout: undefined, rows: [], restEndsAt: undefined, restTotalSec: undefined });
    },

    async startRest(seconds) {
      const w = get().workout;
      if (!w) return;
      const ends = restEndsAt(Date.now(), seconds);
      set({ restEndsAt: ends, restTotalSec: seconds });
      await workoutRepo.update(w.id, { restTimerEndsAt: ends });
    },

    async adjustRest(deltaSec) {
      const w = get().workout;
      const cur = get().restEndsAt;
      if (!w || !cur) return;
      const ends = adjustRest(cur, deltaSec, Date.now());
      set((st) => ({ restEndsAt: ends, restTotalSec: Math.max(1, (st.restTotalSec ?? 0) + deltaSec) }));
      await workoutRepo.update(w.id, { restTimerEndsAt: ends });
    },

    async skipRest() {
      const w = get().workout;
      set({ restEndsAt: undefined, restTotalSec: undefined });
      if (w) await workoutRepo.update(w.id, { restTimerEndsAt: undefined });
    },

    async setWorkoutNotes(notes) {
      const w = get().workout;
      if (!w) return;
      const value = notes.trim() === '' ? undefined : notes;
      set({ workout: { ...w, notes: value } });
      await workoutRepo.update(w.id, { notes: value });
    },

    async setExerciseNote(workoutExerciseId, notes) {
      const value = notes.trim() === '' ? undefined : notes;
      set((st) => ({ rows: st.rows.map((r) => (r.we.id === workoutExerciseId ? { ...r, we: { ...r.we, notes: value } } : r)) }));
      await workoutRepo.updateExercise(workoutExerciseId, { notes: value });
    },

    async setStickyNote(exerciseId, note) {
      const value = note.trim() === '' ? undefined : note;
      set((st) => ({
        rows: st.rows.map((r) => (r.exercise.id === exerciseId ? { ...r, exercise: { ...r.exercise, stickyNote: value } } : r)),
      }));
      await exerciseRepo.update(exerciseId, { stickyNote: value });
    },

    async moveExercise(workoutExerciseId, delta) {
      const w = get().workout;
      if (!w) return;
      const ids = get().rows.map((r) => r.we.id);
      const next = moveItem(ids, ids.indexOf(workoutExerciseId), delta);
      if (next.every((id, i) => id === ids[i])) return;
      await workoutRepo.reorderExercises(next);
      await refresh(w.id);
    },

    async swapExercise(workoutExerciseId, newExerciseId) {
      const w = get().workout;
      const row = get().rows.find((r) => r.we.id === workoutExerciseId);
      if (!w || !row) return false;
      if (row.sets.some((s) => s.completedAt)) return false;
      if (row.we.exerciseId === newExerciseId) return true;
      const last = await workoutRepo.lastSetsFor(newExerciseId, w.id);
      await workoutRepo.replaceExercise(workoutExerciseId, newExerciseId);
      for (const draft of prefillDrafts(last)) {
        await workoutRepo.addSet(workoutExerciseId, { ...draft, unit: last[0]?.unit ?? get().unit });
      }
      await refresh(w.id);
      return true;
    },
  };
});
