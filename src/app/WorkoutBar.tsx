import { useEffect, useState } from 'react';
import { useUi } from './uiStore';
import { isEditingPast, useWorkout } from '../features/train/workoutStore';

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Strong-style bar above the tabs while a workout is open, on every tab and in Settings, so the
 * workout is always one tap away. Hidden only when the workout itself is on screen.
 */
export function WorkoutBar() {
  const workout = useWorkout((s) => s.workout);
  const done = useWorkout((s) => s.rows.reduce((n, r) => n + r.sets.filter((x) => x.completedAt).length, 0));
  const total = useWorkout((s) => s.rows.reduce((n, r) => n + r.sets.length, 0));
  const tab = useUi((s) => s.tab);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!workout) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [workout]);

  if (!workout || (tab === 'train' && !settingsOpen)) return null;
  const editing = isEditingPast(workout);
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(workout.startedAt)) / 1000));
  return (
    <button
      type="button"
      onClick={() => {
        useUi.getState().setSettingsOpen(false);
        useUi.getState().setTab('train');
      }}
      className="px-safe flex min-h-[52px] w-full items-center gap-3 border-t border-line bg-surface-2 text-left"
      aria-label={`Back to ${workout.name}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{editing ? `Editing ${workout.name}` : workout.name}</span>
        <span className="num block text-sm text-muted">{total > 0 ? `${done} of ${total} sets` : 'No sets yet'}</span>
      </span>
      {!editing && <span className="num text-2xl tabular-nums">{clock(elapsed)}</span>}
      <span aria-hidden="true" className="text-muted">›</span>
    </button>
  );
}
