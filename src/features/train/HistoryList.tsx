import { useEffect, useState } from 'react';
import { exerciseRepo, workoutRepo, type FullWorkout } from '../../db/repositories';
import { durationMinutes } from '../../domain/logging';
import type { Exercise } from '../../domain/types';

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** Finished workouts, newest first. Read-only for now; editing past workouts is Milestone 1b. */
export function HistoryList() {
  const [items, setItems] = useState<FullWorkout[] | null>(null);
  const [names, setNames] = useState<Map<string, Exercise>>(new Map());

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
  }, []);

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
          </li>
        );
      })}
    </ul>
  );
}
