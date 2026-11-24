import { useEffect, useState } from 'react';
import { UNDO_EVENT, exerciseRepo, workoutRepo, type FullWorkout } from '../../db/repositories';
import { useWorkout } from './workoutStore';
import { durationMinutes } from '../../domain/logging';
import type { Exercise } from '../../domain/types';

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** Finished workouts, newest first. Each can be edited in place or repeated as a new workout. */
export function HistoryList() {
  const openPast = useWorkout((s) => s.openPast);
  const duplicate = useWorkout((s) => s.duplicate);
  const [items, setItems] = useState<FullWorkout[] | null>(null);
  const [names, setNames] = useState<Map<string, Exercise>>(new Map());

  const [tick, setTick] = useState(0);
  // Reload after any undoable action (delete, undo) so the list never shows stale rows.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(UNDO_EVENT, bump);
    return () => window.removeEventListener(UNDO_EVENT, bump);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [history, exercises] = await Promise.all([workoutRepo.listHistory(30), exerciseRepo.list()]);
      const full = (await Promise.all(history.map((w) => workoutRepo.getFull(w.id)))).filter((f): f is FullWorkout => !!f);
      if (!live) return;
      setNames(new Map(exercises.map((e) => [e.id, e])));
      setItems(full);
    })();
    return () => {
      live = false;
    };
  }, [tick]);

  if (items === null) return null;
  if (items.length === 0) return <p className="py-4 text-sm text-muted">No finished workouts yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {items.map(({ workout, exercises }) => {
        const setCount = exercises.reduce((n, e) => n + e.sets.filter((s) => s.completedAt).length, 0);
        return (
          <li key={workout.id} className="rounded-card border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xl uppercase">{workout.name}</span>
              <span className="text-sm text-muted">{dateFmt.format(new Date(workout.startedAt))}</span>
            </div>
            <p className="num text-sm text-muted">
              {exercises.length} exercises · {setCount} sets{workout.endedAt ? ` · ${durationMinutes(workout.startedAt, workout.endedAt)} min` : ''}
            </p>
            <p className="pt-1 text-sm text-fg">{exercises.map((e) => names.get(e.exerciseId)?.name ?? 'Exercise').join(', ')}</p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => void openPast(workout.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Edit</button>
              <button type="button" onClick={() => void duplicate(workout.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Repeat</button>
              <button type="button" onClick={() => void workoutRepo.deleteUndoable(workout.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Delete</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
