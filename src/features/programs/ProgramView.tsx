import { useEffect, useState } from 'react';
import { plannedSessionRepo, programRepo } from '../../db/repositories';
import { nextSession, weekLabel, type ProgramTree } from '../../domain/program';
import { describeTargets } from '../../domain/routine';
import type { Program } from '../../domain/types';
import { PlanVsActual } from './PlanVsActual';
import { useWorkout } from '../train/workoutStore';

interface Props {
  programId: string;
  onBack: () => void;
  onEdit: (tree: ProgramTree) => void;
  onStarted: () => void;
}

const btn = 'min-h-tap rounded-card border border-line px-3 text-sm text-fg';

/** One program: its weeks and sessions (start any), status, edit (new version) and version history. */
export function ProgramView({ programId, onBack, onEdit, onStarted }: Props) {
  const startFromPlanned = useWorkout((s) => s.startFromPlanned);
  const busy = useWorkout((s) => !!s.workout);
  const [tree, setTree] = useState<ProgramTree | null>(null);
  const [history, setHistory] = useState<Program[]>([]);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    let live = true;
    void programRepo.getTree(programId).then(async (t) => {
      if (!live || !t) return;
      setTree(t);
      setHistory(await programRepo.history(t.program));
    });
    return () => {
      live = false;
    };
  }, [programId, tick]);

  if (!tree) return <div className="min-h-full" />;
  const { program } = tree;
  const next = nextSession(tree);
  const start = (id: string) => void startFromPlanned(id).then((ok) => ok && onStarted());

  return (
    <div className="flex min-h-full flex-col pb-6">
      <div className="flex items-baseline justify-between pb-1 pt-6">
        <h1 className="text-4xl uppercase">{program.name}</h1>
        <button type="button" onClick={onBack} className="min-h-tap px-2 text-sm text-muted">Back</button>
      </div>
      <p className="num pb-2 text-sm text-muted">
        v{program.version} · {program.status}
        {program.daysPerWeek ? ` · ${program.daysPerWeek} days/week` : ''}
        {program.startDate ? ` · starts ${program.startDate}` : ''}
      </p>
      {program.description && <p className="pb-2 text-sm text-fg">{program.description}</p>}
      <p className="pb-3 text-sm text-muted">Reason: {program.changeReason}</p>
      <div className="flex flex-wrap gap-2 pb-4">
        <button type="button" className={btn} onClick={() => onEdit(tree)}>Edit (new version)</button>
        {program.status !== 'active' ? (
          <button type="button" className={btn} onClick={() => void programRepo.setStatus(program.id, 'active').then(() => setTick((t) => t + 1))}>Make active</button>
        ) : (
          <button type="button" className={btn} onClick={() => void programRepo.setStatus(program.id, 'completed').then(() => setTick((t) => t + 1))}>Mark completed</button>
        )}
        {program.status !== 'archived' && (
          <button type="button" className={btn} onClick={() => void programRepo.setStatus(program.id, 'archived').then(() => setTick((t) => t + 1))}>Archive</button>
        )}
        <button type="button" className={btn} onClick={() => void programRepo.deleteUndoable(program).then(onBack)}>Delete</button>
      </div>

      {tree.weeks.length === 0 && <p className="text-sm text-muted">No weeks yet.</p>}
      {tree.weeks.map((w) => (
        <section key={w.id} className="mb-3 rounded-card border border-line bg-surface p-3" aria-label={weekLabel(w)}>
          <h2 className="pb-1 text-2xl uppercase">{weekLabel(w)}</h2>
          <ul className="flex flex-col gap-2">
            {w.sessions.map((s) => {
              const isNext = next?.session.id === s.id;
              return (
                <li key={s.id} className={`rounded-card border p-2 ${isNext ? 'border-accent' : 'border-line'} bg-surface-2`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg uppercase">{s.name}</span>
                    <span className="text-xs text-muted">{s.completedWorkoutId ? 'Done' : s.skipped ? 'Skipped' : isNext ? 'Next' : ''}</span>
                  </div>
                  <ul className="text-sm text-muted">
                    {s.exercises.map((e, i) => <li key={i} className="num">{describeTargets(e.targets)}</li>)}
                  </ul>
                  {s.completedWorkoutId && (
                    <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className={`mt-2 w-full ${btn}`}>
                      {open === s.id ? 'Hide plan vs completed' : 'Plan vs completed'}
                    </button>
                  )}
                  {open === s.id && <PlanVsActual session={s} />}
                  {s.exercises.length > 0 && !s.completedWorkoutId && !s.skipped && (
                    <button type="button" disabled={busy} onClick={() => start(s.id)} className={`mt-2 w-full ${btn} ${isNext ? 'bg-accent font-semibold uppercase text-accent-fg' : ''}`}>
                      {busy ? 'Finish the current workout first' : 'Start'}
                    </button>
                  )}
                  {!s.completedWorkoutId && (
                    <button type="button" onClick={() => void plannedSessionRepo.update(s.id, { skipped: s.skipped ? undefined : true }).then(refresh)} className={`mt-2 w-full ${btn}`}>
                      {s.skipped ? 'Unskip' : 'Skip'}
                    </button>
                  )}
                </li>
              );
            })}
            {w.sessions.length === 0 && <li className="text-sm text-muted">No sessions</li>}
          </ul>
        </section>
      ))}

      {history.length > 1 && (
        <section aria-label="Version history" className="pt-2">
          <h2 className="pb-1 text-2xl uppercase">Versions</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((p) => (
              <li key={p.id} className="text-muted">
                <span className="num text-fg">v{p.version}</span> · {new Date(p.createdAt).toLocaleDateString()} · {p.changeReason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
