import { useEffect, useState } from 'react';
import { useUi } from '../../app/uiStore';
import { UNDO_EVENT, programRepo } from '../../db/repositories';
import { nextSession } from '../../domain/program';
import type { Program } from '../../domain/types';
import { useWorkout } from '../train/workoutStore';

interface Props {
  onOpen: (programId: string) => void;
  onNew: () => void;
  onStarted: () => void;
}

/** Programs on the Train home: active first, with the next planned session one tap away. */
export function ProgramList({ onOpen, onNew, onStarted }: Props) {
  const startFromPlanned = useWorkout((s) => s.startFromPlanned);
  const [items, setItems] = useState<{ program: Program; next?: { id: string; label: string } }[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(UNDO_EVENT, bump);
    return () => window.removeEventListener(UNDO_EVENT, bump);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const programs = await programRepo.listLatest();
      const rows = await Promise.all(
        programs.map(async (program) => {
          const tree = program.status === 'active' ? await programRepo.getTree(program.id) : undefined;
          const n = tree ? nextSession(tree) : undefined;
          return { program, ...(n && n.session.exercises.length > 0 ? { next: { id: n.session.id, label: `Week ${n.week.weekNumber} · ${n.session.name}` } } : {}) };
        }),
      );
      const rank = (p: Program) => (p.status === 'active' ? 0 : p.status === 'draft' ? 1 : 2);
      if (live) setItems(rows.sort((a, b) => rank(a.program) - rank(b.program)));
    })();
    return () => {
      live = false;
    };
  }, [tick]);

  return (
    <section className="mb-4" aria-label="Programs">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-2xl uppercase">Program</h2>
        <button type="button" onClick={onNew} className="min-h-tap px-2 text-sm text-fg underline">New program</button>
      </div>
      {items?.length === 0 && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">No programs yet.</p>
          <button
            type="button"
            onClick={() => {
              useUi.getState().setStarterRequest(true);
              useUi.getState().setSettingsPage('claude');
              useUi.getState().setSettingsOpen(true);
            }}
            className="min-h-tap rounded-card border border-line px-4 text-sm"
          >
            Add my A/B/C program
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {(items ?? []).map(({ program, next }) => (
          <li key={program.id} className="rounded-card border border-line bg-surface p-3">
            <button type="button" onClick={() => onOpen(program.id)} className="min-h-tap w-full text-left">
              <span className="text-xl uppercase">{program.name}</span>
              <span className="num block text-sm text-muted">v{program.version} · {program.status}</span>
            </button>
            {next && (
              <button
                type="button"
                onClick={() => void startFromPlanned(next.id).then((ok) => ok && onStarted())}
                className="mt-2 min-h-tap w-full rounded-card bg-accent text-sm font-semibold uppercase text-accent-fg"
              >
                Start {next.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
