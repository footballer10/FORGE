import { useEffect, useState } from 'react';
import { UNDO_EVENT, exerciseRepo, routineRepo } from '../../db/repositories';
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
  const [menu, setMenu] = useState<ID | null>(null);

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
      {items?.length === 0 && <p className="text-sm text-muted">No routines yet. Save a finished workout as a routine from Home.</p>}
      <ul className="flex flex-col gap-2">
        {(items ?? []).map((r) => (
          <li key={r.id} className="rounded-card border border-line bg-surface p-3">
            <span className="text-xl uppercase">{r.name}</span>
            <p className="truncate text-sm text-muted">
              {r.exercises.length === 0
                ? 'No exercises'
                : [...r.exercises].sort((a, b) => a.order - b.order).map((e) => names.get(e.exerciseId) ?? 'Deleted exercise').join(', ')}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => void startFromRoutine(r.id).then((ok) => ok && onStarted())}
                className="min-h-tap flex-1 rounded-card bg-accent text-sm font-semibold uppercase text-accent-fg"
              >
                Start
              </button>
              <button type="button" aria-label={`${r.name} options`} aria-expanded={menu === r.id} onClick={() => setMenu(menu === r.id ? null : r.id)} className="min-h-tap min-w-tap rounded-card border border-line text-lg text-muted">⋯</button>
            </div>
            {menu === r.id && (
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => onEdit(r)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Edit</button>
                <button type="button" onClick={() => void routineRepo.deleteUndoable(r.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-fg">Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
