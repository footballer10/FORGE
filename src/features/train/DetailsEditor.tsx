import { useState } from 'react';
import { parseWorkoutDetails, toLocalInput } from '../../domain/workoutDetails';
import type { Workout } from '../../domain/types';
import { useWorkout } from './workoutStore';

const field = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base';

/** Name and start/end of a past workout; saved with one button (validated first). */
export function DetailsEditor({ workout }: { workout: Workout }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(workout.name);
  const [start, setStart] = useState(toLocalInput(workout.startedAt));
  const [end, setEnd] = useState(workout.endedAt ? toLocalInput(workout.endedAt) : '');
  const [msg, setMsg] = useState('');
  const setDetails = useWorkout((s) => s.setDetails);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mb-2 min-h-tap self-start text-sm text-muted underline">
        Edit name and times
      </button>
    );
  }
  async function save() {
    const r = parseWorkoutDetails(name, start, end);
    if (!r.ok) return setMsg(r.error);
    await setDetails({ name: r.name, startedAt: r.startedAt, endedAt: r.endedAt });
    setMsg('');
    setOpen(false);
  }
  return (
    <section className="mb-3 flex flex-col gap-2 rounded-card border border-line bg-surface p-3" aria-label="Workout details">
      <label className="text-sm text-muted">Name<input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-sm text-muted">Start<input type="datetime-local" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label className="text-sm text-muted">End<input type="datetime-local" className={field} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      {msg && <p role="alert" className="text-sm text-accent-text">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} className="min-h-tap flex-1 rounded-card bg-accent px-4 font-medium text-white">Save details</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-tap rounded-card border border-line px-4">Cancel</button>
      </div>
    </section>
  );
}
