import { useEffect, useState } from 'react';
import { UNDO_EVENT, exerciseRepo, routineRepo } from '../../db/repositories';
import { describeTargets } from '../../domain/routine';
import type { ID, Routine } from '../../domain/types';
import { useWorkout } from '../train/workoutStore';

interface Props {
  onEdit: (routine?: Routine) => void;
  /** Called after a workout has been started from a routine. */
  onStarted: () => void;
}

/** Routines on the Train home: start, edit, delete (undoable). */
export function RoutineList({ onEdit, onStarted }: Props) {
  const startFromRoutine = useWorkout((s) => s.startFromRoutine);
  const [items, setItems] = useState<Routine[] | null>(null);
  const [names, setNames] = useState<Map<ID, string>>(new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(UNDO_EVENT, bump);
    return () => window.removeEventListener(UNDO_EVENT, bump);
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([routineRepo.listSorted(), exerciseRepo.list()]).then(([routines, exercises]) => {
      if (!live) return;
      setNames(new Map(exercises.map((e) => [e.id, e.name])));
      setItems(routines);
    });
    return () => {
      live = false;
    };
  }, [tick]);

  return (
    <section className="mb-4" aria-label="Routines">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-2xl uppercase">Routines</h2>
        <button type="button" onClick={() => onEdit()} className="min-h-tap px-2 text-sm text-fg underline">
          New routine
        </button>
      </div>
      {items?.length === 0 && <p className="text-sm text-muted">No routines yet. Create one, or save a finished workout as a routine from History.</p>}
      <ul className="flex flex-col gap-2">
        {(items ?? []).map((r) => (
          <li key={r.id} className="rounded-card border border-line bg-surface p-3">
            <span className="text-xl uppercase">{r.name}</span>
            <ul className="pt-1 text-sm text-muted">
              {[...r.exercises].sort((a, b) => a.order - b.order).map((e, i) => (
                <li key={i}>
                  {names.get(e.exerciseId) ?? 'Deleted exercise'} · <span className="num">{describeTargets(e.targets)}</span>
                </li>
              ))}
              {r.exercises.length === 0 && <li>No exercises</li>}
            </ul>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => void startFromRoutine(r.id).then((ok) => ok && onStarted())}
                className="min-h-tap flex-1 rounded-card bg-accent text-sm font-semibold uppercase text-accent-fg"
              >
                Start
              </button>
              <button type="button" onClick={() => onEdit(r)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Edit</button>
              <button type="button" onClick={() => void routineRepo.deleteUndoable(r.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
