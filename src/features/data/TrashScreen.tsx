import { useCallback, useEffect, useState } from 'react';
import { trashRepo } from '../../db/repositories';
import { TRASH_DAYS, trashDaysLeft } from '../../domain/safety';
import type { Exercise, Workout } from '../../domain/types';

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const btn = 'min-h-tap flex-1 rounded-card border border-line text-sm text-fg';

/** Soft-deleted workouts and exercises. Items are removed for good after 30 days. */
export function TrashScreen({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<{ workouts: Workout[]; exercises: Exercise[] }>();
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');
  const load = useCallback(() => void trashRepo.list().then(setData), []);
  useEffect(load, [load]);
  const now = new Date();

  const left = (d?: string) => (d ? `${trashDaysLeft(d, now)} days left` : '');
  const empty = data && data.workouts.length === 0 && data.exercises.length === 0;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center justify-between pb-1 pt-6">
        <h1 className="text-4xl uppercase">Trash</h1>
        <button type="button" onClick={onBack} className="min-h-tap px-2 text-sm text-muted">Close</button>
      </div>
      <p className="text-sm text-muted">Deleted items stay here for {TRASH_DAYS} days, then are removed for good.</p>
      {note && <p role="status" className="text-sm text-fg">{note}</p>}
      {empty && <p className="text-sm text-muted">The trash is empty.</p>}

      {data && data.workouts.length > 0 && (
        <section>
          <h2 className="pb-2 text-2xl uppercase">Workouts</h2>
          <ul className="flex flex-col gap-2">
            {data.workouts.map((w) => (
              <li key={w.id} className="rounded-card border border-line bg-surface p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl uppercase">{w.name}</span>
                  <span className="text-sm text-muted">{dateFmt.format(new Date(w.startedAt))}</span>
                </div>
                <p className="num text-sm text-muted">{left(w.deletedAt)}</p>
                <div className="flex gap-2 pt-2">
                  <button type="button" className={btn} onClick={() => void trashRepo.restoreWorkout(w.id).then(load)}>Restore</button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      if (confirm !== w.id) return setConfirm(w.id);
                      setConfirm('');
                      void trashRepo.purgeWorkout(w.id).then(load);
                    }}
                  >
                    {confirm === w.id ? 'Tap again to delete forever' : 'Delete forever'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.exercises.length > 0 && (
        <section>
          <h2 className="pb-2 text-2xl uppercase">Exercises</h2>
          <ul className="flex flex-col gap-2">
            {data.exercises.map((e) => (
              <li key={e.id} className="rounded-card border border-line bg-surface p-3">
                <span className="text-base text-fg">{e.name}</span>
                <p className="num text-sm text-muted">{left(e.deletedAt)}</p>
                <div className="flex gap-2 pt-2">
                  <button type="button" className={btn} onClick={() => void trashRepo.restoreExercise(e.id).then(load)}>Restore</button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      if (confirm !== e.id) return setConfirm(e.id);
                      setConfirm('');
                      void trashRepo.purgeExercise(e.id).then((ok) => {
                        setNote(ok ? '' : 'Kept: library exercises and exercises with logged sets cannot be removed for good.');
                        load();
                      });
                    }}
                  >
                    {confirm === e.id ? 'Tap again to delete forever' : 'Delete forever'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
