import { create } from 'zustand';
import { achievementsRepo, exerciseRepo, metaRepo, nowIso, plannedSessionRepo, profileRepo, routineRepo, undoRepo, workoutRepo } from '../../db/repositories';
import { convertWeight } from '../../domain/units';
import { autoWarmupWeights, buildWarmups, warmupKitFor } from '../../domain/warmup';
import type { ConditioningExerciseName, ConditioningPreset } from '../../domain/conditioningPresets';
import { triageOpenWorkouts } from '../../domain/openWorkouts';
import { canComplete, prefillDrafts, suggestionTarget } from '../../domain/logging';
import { moveItem } from '../../domain/order';
import { restAfterExercise, toggleSupersetLink } from '../../domain/superset';
import { adjustRest, isStale, restEndsAt, restSecondsFor } from '../../domain/restTimer';
import type { EquipmentProfile, Exercise, ID, SetEntry, WeightUnit, Workout, WorkoutExercise } from '../../domain/types';

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
  showPairTotal: boolean;
  /** Equipment profile used for the plate calculator. */
  equipment?: EquipmentProfile;
  /** Absolute end of the running rest timer (ISO), if any. Persisted on the workout. */
  restEndsAt?: string;
  /** Length the current rest started with, for the progress bar only. */
  restTotalSec?: number;
  /** An unfinished workout idle for over 3 hours: not opened automatically; the user chooses. */
  staleWorkout?: { id: ID; name: string; startedAt: string; lastActivity: string; completedSets: number };
  resumeStale: () => Promise<void>;
  finishStale: () => Promise<void>;
  discardStale: () => Promise<void>;
  /** Fill warm-up weights from the first working weight (Settings). */
  autoWarmup: boolean;
  /** Warm-up sets whose weight the user typed this session: auto-fill leaves them alone. */
  manualWarmups: ID[];
  /** Recompute warm-up weights for one exercise, or all of them. Completed and hand-typed warm-ups are kept. */
  autoFillWarmups: (workoutExerciseId?: ID) => Promise<void>;
  setAutoWarmup: (on: boolean) => Promise<void>;
  /** Start a conditioning session from a preset (sprints, intervals, test runs). False if a workout is already open. */
  startConditioningPreset: (preset: ConditioningPreset) => Promise<boolean>;
  /** Sets that just set a rep PR (brief highlight; memory only). */
  prSetIds: ID[];
  /** Workout just finished (not an edit): the summary sheet shows it. */
  finishedId?: ID;
  clearFinished: () => void;
  /** Resume an unfinished workout (crash / reopen) or find none. */
  load: () => Promise<void>;
  /** Start an empty workout; `conditioning` marks it as a time/distance session. */
  start: (kind?: 'conditioning') => Promise<void>;
  /** Start a workout from a routine. Returns false if one is already active or the routine is gone. */
  startFromRoutine: (routineId: ID) => Promise<boolean>;
  /** Start a workout from a planned program session (linked via plannedSessionId). */
  startFromPlanned: (plannedSessionId: ID) => Promise<boolean>;
  addExercise: (exerciseId: ID) => Promise<void>;
  removeExercise: (workoutExerciseId: ID) => Promise<void>;
  addSet: (workoutExerciseId: ID) => Promise<void>;
  updateSet: (setId: ID, patch: Partial<SetEntry>) => Promise<void>;
  /** Fill the next open working set of an exercise with its suggested weight (and reps). */
  fillSuggested: (workoutExerciseId: ID) => Promise<void>;
  /** Put warm-up sets before the working sets (bar, 50%, 70%, 85% of the first working weight). */
  addWarmups: (workoutExerciseId: ID, bar: number, plates: number[]) => Promise<void>;
  /** Tick a set done (needs reps / time) or un-tick it. Returns false when it cannot complete yet. */
  toggleComplete: (setId: ID) => Promise<boolean>;
  removeSet: (setId: ID) => Promise<void>;
  /** Drops unticked sets and empty exercises, then ends the workout. Returns false if nothing was completed. */
  finish: () => Promise<boolean>;
  discard: () => Promise<void>;
  /** Edit a past workout's name and times (already validated). */
  setDetails: (d: { name: string; startedAt: string; endedAt: string }) => Promise<void>;
  /** Reopen a finished workout for editing in place (its end time is kept). */
  openPast: (workoutId: ID) => Promise<void>;
  /** Start a new workout from a past one's structure. Returns false if a workout is already active. */
  duplicate: (workoutId: ID) => Promise<boolean>;
  /** Link / unlink this exercise with the next one as a superset. */
  toggleSuperset: (workoutExerciseId: ID) => Promise<void>;
  setShowPairTotal: (show: boolean) => Promise<void>;
  startRest: (seconds: number) => Promise<void>;
  adjustRest: (deltaSec: number) => Promise<void>;
  skipRest: () => Promise<void>;
  setWorkoutNotes: (notes: string) => Promise<void>;
  /** Note for this exercise in this session only. */
  setExerciseNote: (workoutExerciseId: ID, notes: string) => Promise<void>;
  /** Sticky note stored on the exercise itself; shown every time it is logged. */
  setStickyNote: (exerciseId: ID, note: string) => Promise<void>;
  moveExercise: (workoutExerciseId: ID, delta: -1 | 1) => Promise<void>;
  /** Apply a full new order (drag and drop). */
  setExerciseOrder: (orderedIds: ID[]) => Promise<void>;
  /** Replace an exercise that has no completed sets. Returns false when sets are already done. */
  swapExercise: (workoutExerciseId: ID, newExerciseId: ID) => Promise<boolean>;
}

/** meta key holding the ID of a finished workout that is being edited (survives reload). */
const EDITING_KEY = 'editingWorkoutId';

/** The time/distance exercise a preset logs to; created once as a custom exercise if the library has none by that name. */
async function ensureConditioningExercise(name: ConditioningExerciseName): Promise<ID> {
  const found = await exerciseRepo.findByName(name);
  if (found && found.loadModel === 'timeDistance') return found.id;
  const created = await exerciseRepo.create({
    name: found ? `${name} (time/distance)` : name,
    aliases: [], equipment: 'bodyweight', primaryMuscles: ['quadriceps', 'hamstrings', 'calves'], secondaryMuscles: ['glutes'],
    pattern: 'conditioning', unilateral: false, defaultRestSec: 90, weightIncrement: 5, incrementUnit: 'lb', loadModel: 'timeDistance', source: 'custom',
  });
  return created.id;
}

/** True when the open workout is a finished one being edited. */
export const isEditingPast = (w?: Workout) => !!w?.endedAt;

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
    autoWarmup: true,
    manualWarmups: [],
    prSetIds: [],
    clearFinished: () => set({ finishedId: undefined }),
    rows: [],
    unit: 'lb',
    showPairTotal: false,

    async load() {
      const [profile, open] = await Promise.all([profileRepo.get(), workoutRepo.openWorkouts()]);
      // Editing a past workout is never resumed on load: its edits are already saved, and reopening it
      // made a finished workout look like one in progress.
      if (await metaRepo.get<string>(EDITING_KEY)) await metaRepo.set(EDITING_KEY, null);
      const plan = triageOpenWorkouts(open.map((o) => ({ id: o.workout.id, lastActivityMs: o.lastActivityMs, completedSets: o.completedSets })), Date.now());
      for (const c of plan.close) {
        if (c.action === 'finish') await workoutRepo.update(c.id, { endedAt: new Date(c.endedAtMs).toISOString(), restTimerEndsAt: undefined });
        else await workoutRepo.softDelete(c.id);
      }
      const active = open.find((o) => o.workout.id === plan.resume)?.workout;
      const ask = open.find((o) => o.workout.id === plan.ask);
      set({
        staleWorkout: ask
          ? { id: ask.workout.id, name: ask.workout.name, startedAt: ask.workout.startedAt, lastActivity: new Date(ask.lastActivityMs).toISOString(), completedSets: ask.completedSets }
          : undefined,
      });
      const equipment = profile.equipmentProfiles.find((e) => e.id === profile.defaultEquipmentProfileId);
      set({ unit: profile.weightUnit, showPairTotal: profile.showDumbbellPairTotal, autoWarmup: profile.autoWarmups !== false, manualWarmups: [], ...(equipment ? { equipment } : {}), rows: [], restEndsAt: undefined, restTotalSec: undefined });
      if (active) {
        await refresh(active.id);
        const ends = active.restTimerEndsAt;
        if (ends && !isStale(ends, Date.now())) set({ restEndsAt: ends });
        else if (ends) await workoutRepo.update(active.id, { restTimerEndsAt: undefined });
      }
      set({ loaded: true });
    },

    async start(kind) {
      if (get().workout) return;
      const w = await workoutRepo.start(kind ? { kind, name: 'Conditioning' } : {});
      set({ rows: [] });
      await refresh(w.id);
    },

    async startFromRoutine(routineId) {
      if (get().workout) return false;
      const routine = await routineRepo.get(routineId);
      if (!routine || routine.deletedAt) return false;
      const w = await workoutRepo.startFromRoutine(routine, get().unit);
      set({ rows: [], manualWarmups: [] });
      await refresh(w.id);
      await get().autoFillWarmups();
      return true;
    },

    async startFromPlanned(plannedSessionId) {
      if (get().workout) return false;
      const ps = await plannedSessionRepo.get(plannedSessionId);
      if (!ps || ps.deletedAt) return false;
      const w = await workoutRepo.startFromPlan({ name: ps.name, exercises: ps.exercises, plannedSessionId: ps.id }, get().unit);
      set({ rows: [], manualWarmups: [] });
      await refresh(w.id);
      await get().autoFillWarmups();
      return true;
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
      await get().autoFillWarmups(we.id);
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
      const found = findSet(setId);
      if (!found || isEditingPast(get().workout)) return;
      if (found.set.type === 'warmup' && patch.weight !== undefined && patch.type === undefined) {
        // The user chose this warm-up weight: auto-fill must not overwrite it.
        set((st) => ({ manualWarmups: st.manualWarmups.includes(setId) ? st.manualWarmups : [...st.manualWarmups, setId] }));
        return;
      }
      const firstWork = found.row.sets.find((s) => s.type !== 'warmup');
      if (patch.type !== undefined || (patch.weight !== undefined && firstWork?.id === setId)) await get().autoFillWarmups(found.row.we.id);
    },

    async autoFillWarmups(workoutExerciseId) {
      const { autoWarmup, equipment, unit, manualWarmups } = get();
      if (!autoWarmup || isEditingPast(get().workout)) return;
      for (const row of get().rows) {
        if (workoutExerciseId && row.we.id !== workoutExerciseId) continue;
        const warm = row.sets.filter((s) => s.type === 'warmup');
        const first = row.sets.find((s) => s.type !== 'warmup' && s.weight !== undefined && s.weight > 0);
        const kit = warmupKitFor(row.exercise, equipment, unit);
        if (!warm.length || !first || first.weight === undefined || !kit) continue;
        const plan = autoWarmupWeights(convertWeight(first.weight, first.unit, unit), warm.length, kit);
        for (const [i, s] of warm.entries()) {
          const step = plan[i];
          if (!step || s.completedAt || manualWarmups.includes(s.id)) continue;
          const reps = s.reps ?? step.reps;
          if (s.weight === step.weight && s.unit === unit && s.reps === reps) continue;
          const p = { weight: step.weight, unit, reps };
          patchLocal(s.id, p);
          await workoutRepo.updateSet(s.id, p);
        }
      }
    },

    async resumeStale() {
      const s = get().staleWorkout;
      if (!s || get().workout) return;
      set({ staleWorkout: undefined, rows: [], manualWarmups: [] });
      await refresh(s.id);
    },

    async finishStale() {
      const s = get().staleWorkout;
      if (!s || get().workout) return;
      await get().resumeStale();
      // Same as Finish (drops unticked sets, links a planned session), then dated when it was last used.
      if (await get().finish()) await workoutRepo.update(s.id, { endedAt: s.lastActivity });
    },

    async discardStale() {
      const s = get().staleWorkout;
      if (!s) return;
      await workoutRepo.deleteUndoable(s.id, 'Discarded workout');
      set({ staleWorkout: undefined });
    },

    async startConditioningPreset(preset) {
      if (get().workout) return false;
      const exerciseId = await ensureConditioningExercise(preset.exercise);
      const w = await workoutRepo.startFromPlan(
        { name: preset.name, exercises: [{ exerciseId, order: 0, targets: Array.from({ length: preset.count }, () => ({ type: 'working' as const, distanceM: preset.distanceM, restSec: preset.restSec })) }] },
        get().unit,
      );
      await workoutRepo.update(w.id, { kind: 'conditioning' });
      set({ rows: [], manualWarmups: [] });
      await refresh(w.id);
      return true;
    },

    async setAutoWarmup(on) {
      set({ autoWarmup: on });
      await profileRepo.update({ autoWarmups: on });
      if (on) await get().autoFillWarmups();
    },

    async addWarmups(workoutExerciseId, bar, plates) {
      const w = get().workout;
      const row = get().rows.find((r) => r.we.id === workoutExerciseId);
      if (!w || !row || row.sets.some((s) => s.type === 'warmup')) return;
      const first = row.sets.find((s) => s.type !== 'warmup' && s.weight !== undefined && s.weight > 0);
      if (!first || first.weight === undefined) return;
      const unit = get().unit;
      const work = convertWeight(first.weight, first.unit, unit);
      const drafts = buildWarmups(work, bar, plates).map((s) => ({ weight: s.weight, reps: s.reps, unit }));
      if (drafts.length === 0) return;
      await workoutRepo.insertWarmups(workoutExerciseId, drafts);
      await refresh(w.id);
      await get().autoFillWarmups(workoutExerciseId);
    },

    async fillSuggested(workoutExerciseId) {
      const row = get().rows.find((r) => r.we.id === workoutExerciseId);
      const sug = row?.we.suggested;
      const target = row && sug ? suggestionTarget(row.sets) : undefined;
      if (!sug || !target) return;
      await get().updateSet(target.id, { weight: sug.weight, unit: sug.unit, ...(sug.reps !== undefined ? { reps: sug.reps } : {}) });
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
      // A rest typed for this set in the routine/program (matched by position) beats the exercise rest.
      const position = found.row.sets.findIndex((s) => s.id === setId);
      const sec = restSecondsFor(found.row.exercise, found.set.type, found.row.we.restSec, found.row.we.targets?.[position]?.restSec);
      const items = get().rows.map((r) => ({ id: r.we.id, supersetGroup: r.we.supersetGroup }));
      const due = restAfterExercise(items, found.row.we.id);
      if (sec > 0 && due && !isEditingPast(get().workout)) await get().startRest(sec);
      // Brief PR highlight for a working set that beats the history (never blocks logging).
      if (found.set.type !== 'warmup') {
        void achievementsRepo
          .isRepPr(setId)
          .then((pr) => {
            if (pr) set((st) => ({ prSetIds: [...st.prSetIds, setId] }));
          })
          .catch(() => undefined);
      }
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
      const editing = isEditingPast(w);
      const dropSets = rows.flatMap((r) => r.sets.filter((s) => !s.completedAt).map((s) => s.id));
      const dropExercises = rows.filter((r) => !r.sets.some((s) => s.completedAt)).map((r) => r.we.id);
      const planned = !editing && w.plannedSessionId ? [w.plannedSessionId] : [];
      await undoRepo.run(editing ? 'Saved workout edits' : 'Finished workout', { workouts: [w.id], sets: dropSets, workoutExercises: dropExercises, plannedSessions: planned }, async () => {
        for (const id of dropSets) await workoutRepo.removeSet(id);
        for (const id of dropExercises) await workoutRepo.removeExercise(id);
        if (editing) await metaRepo.set(EDITING_KEY, null);
        else {
          await workoutRepo.finish(w.id);
          // Link the planned session to this workout (the plan is done; skipped is cleared).
          for (const id of planned) await plannedSessionRepo.update(id, { completedWorkoutId: w.id, skipped: undefined });
        }
      });
      set({ workout: undefined, rows: [], restEndsAt: undefined, restTotalSec: undefined, prSetIds: [], ...(editing ? {} : { finishedId: w.id }) });
      return true;
    },

    async discard() {
      const w = get().workout;
      if (!w) return;
      if (isEditingPast(w)) await metaRepo.set(EDITING_KEY, null); // edits are already saved; just close
      else await workoutRepo.deleteUndoable(w.id, 'Discarded workout');
      set({ workout: undefined, rows: [], restEndsAt: undefined, restTotalSec: undefined });
    },

    async openPast(workoutId) {
      if (get().workout) return;
      await metaRepo.set(EDITING_KEY, workoutId);
      set({ rows: [] });
      await refresh(workoutId);
    },

    async duplicate(workoutId) {
      if (get().workout) return false;
      const w = await workoutRepo.duplicate(workoutId);
      if (!w) return false;
      set({ rows: [], manualWarmups: [] });
      await refresh(w.id);
      await get().autoFillWarmups();
      return true;
    },

    async toggleSuperset(workoutExerciseId) {
      const w = get().workout;
      if (!w) return;
      const items = get().rows.map((r) => ({ id: r.we.id, supersetGroup: r.we.supersetGroup }));
      const groups = toggleSupersetLink(items, workoutExerciseId);
      for (const it of items) {
        if (groups[it.id] !== it.supersetGroup) await workoutRepo.updateExercise(it.id, { supersetGroup: groups[it.id] });
      }
      await refresh(w.id);
    },

    async setShowPairTotal(show) {
      set({ showPairTotal: show });
      await profileRepo.update({ showDumbbellPairTotal: show });
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

    async setDetails(d) {
      const w = get().workout;
      if (!w) return;
      set({ workout: { ...w, ...d } });
      await workoutRepo.update(w.id, d);
    },

    async setWorkoutNotes(notes) {
      const w = get().workout;
      if (!w) return;
      const value = notes === '' ? undefined : notes;
      set({ workout: { ...w, notes: value } });
      await workoutRepo.update(w.id, { notes: value });
    },

    async setExerciseNote(workoutExerciseId, notes) {
      const value = notes === '' ? undefined : notes;
      set((st) => ({ rows: st.rows.map((r) => (r.we.id === workoutExerciseId ? { ...r, we: { ...r.we, notes: value } } : r)) }));
      await workoutRepo.updateExercise(workoutExerciseId, { notes: value });
    },

    async setStickyNote(exerciseId, note) {
      const value = note === '' ? undefined : note;
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

    async setExerciseOrder(orderedIds) {
      const w = get().workout;
      if (!w) return;
      const ids = get().rows.map((r) => r.we.id);
      if (orderedIds.length !== ids.length || !orderedIds.every((id) => ids.includes(id)) || orderedIds.every((id, i) => id === ids[i])) return;
      await workoutRepo.reorderExercises(orderedIds);
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
      await get().autoFillWarmups(workoutExerciseId);
      return true;
    },
  };
});
