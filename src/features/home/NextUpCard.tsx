import { useEffect, useState } from 'react';
import { useUi } from '../../app/uiStore';
import { programRepo, routineRepo, workoutRepo } from '../../db/repositories';
import { pickNextUp, type NextUp, type PreviewLine } from '../../domain/nextUp';
import type { ProgramTree } from '../../domain/program';
import { useWorkout } from '../train/workoutStore';

/** "Next up": the active program's next session (or the last routine) with the weights it will start with. One tap starts it. */
export function NextUpCard() {
  const unit = useWorkout((s) => s.unit);
  const busy = useWorkout((s) => !!s.workout);
  const startFromPlanned = useWorkout((s) => s.startFromPlanned);
  const startFromRoutine = useWorkout((s) => s.startFromRoutine);
  const [next, setNext] = useState<NextUp | null>(null);
  const [lines, setLines] = useState<PreviewLine[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const programs = await programRepo.listLatest();
      const trees = (await Promise.all(programs.filter((p) => p.status === 'active').map((p) => programRepo.getTree(p.id)))).filter((t): t is ProgramTree => !!t);
      const [routines, workouts] = await Promise.all([routineRepo.listSorted(), workoutRepo.listHistory(20)]);
      const n = pickNextUp({ trees, routines, workouts }) ?? null;
      const preview = n ? await workoutRepo.previewPlan(n.exercises, unit) : [];
      if (live) {
        setNext(n);
        setLines(preview);
      }
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [unit, busy]);

  if (!next || busy) return null;
  const start = () => void (next.kind === 'program' ? startFromPlanned(next.id) : startFromRoutine(next.id)).then((ok) => ok && useUi.getState().setTab('train'));

  return (
    <section aria-label="Next up" className="mb-4 rounded-card border border-line bg-surface p-3">
      <p className="text-sm text-muted">Next up · {next.source}</p>
      <h2 className="pb-2 text-3xl uppercase">{next.name}</h2>
      <ul className="num pb-3 text-sm">
        {lines.slice(0, 6).map((l) => (
          <li key={l.exerciseId} className="flex justify-between gap-2 py-0.5">
            <span className="truncate">{l.name}</span>
            <span className="shrink-0 text-muted">{l.summary}</span>
          </li>
        ))}
        {lines.length > 6 && <li className="py-0.5 text-muted">+ {lines.length - 6} more</li>}
      </ul>
      <button type="button" onClick={start} className="min-h-tap w-full rounded-card bg-accent text-sm font-semibold uppercase text-accent-fg">
        Start {next.name}
      </button>
    </section>
  );
}
