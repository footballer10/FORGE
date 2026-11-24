import { useEffect, useState } from 'react';
import { achievementsRepo, type WorkoutSummary } from '../../db/repositories';
import type { Achievement } from '../../domain/types';
import { useWorkout } from '../train/workoutStore';
import { prLabel } from './prLabel';

/** Post-workout summary: PRs, new achievements and the weekly streak. Shown once after Finish, never while logging. */
export function WorkoutSummarySheet() {
  const finishedId = useWorkout((s) => s.finishedId);
  const clear = useWorkout((s) => s.clearFinished);
  const [summary, setSummary] = useState<WorkoutSummary>();
  const [fresh, setFresh] = useState<Achievement[]>([]);

  useEffect(() => {
    if (!finishedId) return;
    let live = true;
    void (async () => {
      const added = await achievementsRepo.sync();
      const s = await achievementsRepo.summaryFor(finishedId);
      if (!live) return;
      setFresh(added);
      setSummary(s);
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [finishedId]);

  if (!finishedId || !summary) return null;
  const close = () => {
    // Achievements shown here count as seen so Home does not announce them again.
    void achievementsRepo.markSeen(fresh.map((a) => a.id)).catch(() => undefined);
    setSummary(undefined);
    setFresh([]);
    clear();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Workout summary" className="fixed inset-0 z-40 flex items-end bg-black/60">
      <div className="pb-safe max-h-[85%] w-full overflow-y-auto rounded-t-card bg-surface p-4">
        <h2 className="font-display text-3xl">Workout done</h2>
        <p className="text-sm text-muted">
          {summary.name} · {summary.exercises} exercises · {summary.hardSets} hard sets{summary.durationMin ? ` · ${summary.durationMin} min` : ''}
        </p>
        {summary.prs.length > 0 && (
          <section className="mt-4">
            <h3 className="text-sm text-muted">Personal records</h3>
            <ul className="mt-1 flex flex-col gap-1">
              {summary.prs.map((p, i) => (
                <li key={i} className="rounded-card border border-accent px-3 py-2 text-sm">
                  <span className="font-semibold text-accent">PR</span> {p.exerciseName}: {prLabel(p)}
                </li>
              ))}
            </ul>
          </section>
        )}
        {fresh.length > 0 && (
          <section className="mt-4">
            <h3 className="text-sm text-muted">New achievements</h3>
            <ul className="mt-1 flex flex-col gap-1">
              {fresh.map((a) => (
                <li key={a.id} className="rounded-card bg-surface-2 px-3 py-2 text-sm">
                  <span className="font-semibold">{a.title}</span>
                  <span className="block text-muted">{a.description}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {summary.streak && (
          <p className="mt-4 text-sm text-muted">
            This week: {summary.streak.thisWeekDays} of {summary.streak.target} planned days · streak {summary.streak.current} {summary.streak.current === 1 ? 'week' : 'weeks'}
          </p>
        )}
        <button type="button" onClick={close} className="mt-4 min-h-tap w-full rounded-card bg-accent text-accent-fg">
          Done
        </button>
      </div>
    </div>
  );
}
