import { useEffect, useState } from 'react';
import { UNDO_EVENT, exerciseRepo, routineRepo, workoutRepo, type FullWorkout } from '../../db/repositories';
import { useWorkout } from './workoutStore';
import { durationMinutes, formatSet, inUnit } from '../../domain/logging';
import { targetsFromSets } from '../../domain/routine';
import { bestWorkingSet, setProgress } from '../../domain/workoutView';
import type { Exercise } from '../../domain/types';

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const FIRST = 10;
const PREVIEW = 3;

/**
 * Finished workouts, newest first, as short rows (name, date, three lifts with their best set).
 * Tap a row to open it: every working set and the actions. Warm-ups are only counted, never listed.
 */
export function HistoryList() {
  const unit = useWorkout((s) => s.unit);
  const dist = useWorkout((s) => s.distUnit);
  const openPast = useWorkout((s) => s.openPast);
  const duplicate = useWorkout((s) => s.duplicate);
  const [items, setItems] = useState<FullWorkout[] | null>(null);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [tick, setTick] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(FIRST);

  async function saveAsRoutine({ workout, exercises: wes }: FullWorkout) {
    await routineRepo.create({
      name: workout.name,
      exercises: wes.map((e, order) => ({
        exerciseId: e.exerciseId,
        order,
        ...(e.supersetGroup ? { supersetGroup: e.supersetGroup } : {}),
        targets: targetsFromSets(e.sets),
      })),
    });
    setSaved(workout.id);
    window.dispatchEvent(new Event(UNDO_EVENT)); // refreshes the routine list
  }
  // Reload after any undoable action (delete, undo) so the list never shows stale rows.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(UNDO_EVENT, bump);
    return () => window.removeEventListener(UNDO_EVENT, bump);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [history, all] = await Promise.all([workoutRepo.listHistory(60), exerciseRepo.list()]);
      const full = (await Promise.all(history.map((w) => workoutRepo.getFull(w.id)))).filter((f): f is FullWorkout => !!f);
      if (!live) return;
      setExercises(new Map(all.map((e) => [e.id, e])));
      setItems(full);
    })();
    return () => {
      live = false;
    };
  }, [tick]);

  if (items === null) return null;
  if (items.length === 0) return <p className="py-4 text-sm text-muted">No workouts yet. Start one from the Train tab.</p>;

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {items.slice(0, shown).map((full) => {
          const { workout, exercises: wes } = full;
          const isOpen = open === workout.id;
          const done = wes.filter((e) => e.sets.some((s) => s.completedAt));
          const preview = done.slice(0, PREVIEW);
          return (
            <li key={workout.id} className="rounded-card border border-line bg-surface">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : workout.id)} className="w-full p-3 text-left">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-xl uppercase">{workout.name}</span>
                  <span className="shrink-0 text-sm text-muted">{dateFmt.format(new Date(workout.startedAt))}</span>
                </span>
                <span className="num block text-sm text-muted">
                  {done.length} {done.length === 1 ? 'exercise' : 'exercises'}
                  {workout.endedAt ? ` · ${durationMinutes(workout.startedAt, workout.endedAt)} min` : ''}
                </span>
                {!isOpen && (
                  <span className="mt-1 block text-sm">
                    {preview.map((e) => {
                      const ex = exercises.get(e.exerciseId);
                      const best = bestWorkingSet(e.sets);
                      return (
                        <span key={e.id} className="flex justify-between gap-2">
                          <span className="truncate">{ex?.name ?? 'Exercise'}</span>
                          <span className="num shrink-0 text-muted">{best && ex ? formatSet(inUnit(best, unit), ex.loadModel, unit, dist) : ''}</span>
                        </span>
                      );
                    })}
                    {done.length > PREVIEW && <span className="block text-muted">+{done.length - PREVIEW} more</span>}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  <ul className="flex flex-col gap-2 text-sm">
                    {done.map((e) => {
                      const ex = exercises.get(e.exerciseId);
                      const p = setProgress(e.sets);
                      const working = e.sets.filter((s) => s.type !== 'warmup' && s.completedAt);
                      return (
                        <li key={e.id}>
                          <span className="block font-medium">{ex?.name ?? 'Exercise'}</span>
                          <span className="num block text-muted">
                            {ex ? working.map((s) => formatSet(inUnit(s, unit), ex.loadModel, unit, dist)).join(' · ') : ''}
                            {p.warmupsDone > 0 ? ` (+${p.warmupsDone} warm-up)` : ''}
                          </span>
                        </li>
                      );
                    })}
                    {workout.notes && <li className="whitespace-pre-line text-muted">{workout.notes}</li>}
                  </ul>
                  <div className="flex gap-2 pt-3">
                    <button type="button" onClick={() => void openPast(workout.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Edit</button>
                    <button type="button" onClick={() => void duplicate(workout.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Repeat</button>
                    <button type="button" disabled={saved === workout.id} onClick={() => void saveAsRoutine(full)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">{saved === workout.id ? 'Saved' : 'Routine'}</button>
                    <button type="button" onClick={() => void workoutRepo.deleteUndoable(workout.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Delete</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 20)} className="mt-2 min-h-tap w-full rounded-card border border-line text-sm text-muted">
          Show more ({items.length - shown})
        </button>
      )}
    </div>
  );
}
