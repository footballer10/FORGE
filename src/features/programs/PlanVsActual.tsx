import { useEffect, useState } from 'react';
import { exerciseRepo, workoutRepo } from '../../db/repositories';
import { compareSession, type SessionComparison } from '../../domain/planVsActual';
import { describeTargets } from '../../domain/routine';
import type { PlannedSession } from '../../domain/types';

const REPS: Record<string, string> = { hit: 'on target', below: 'below range', above: 'above range', missed: 'not done' };
const WEIGHT: Record<string, string> = { lighter: 'lighter', heavier: 'heavier' };

/** Planned targets next to what was logged, per exercise and set. Formula: adherence = planned sets with a completed set / planned sets. */
export function PlanVsActual({ session }: { session: PlannedSession }) {
  const [data, setData] = useState<{ cmp: SessionComparison; names: Map<string, string> } | null | 'missing'>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const full = session.completedWorkoutId ? await workoutRepo.getFull(session.completedWorkoutId) : undefined;
      if (!full) return live && setData('missing');
      const exercises = await exerciseRepo.list();
      const cmp = compareSession(session.exercises, full.exercises);
      if (live) setData({ cmp, names: new Map(exercises.map((e) => [e.id, e.name])) });
    })();
    return () => {
      live = false;
    };
  }, [session]);

  if (data === null) return null;
  if (data === 'missing') return <p className="pt-2 text-sm text-muted">The linked workout is no longer available.</p>;
  const { cmp, names } = data;

  return (
    <div className="pt-2" aria-label="Plan vs completed">
      <p className="num text-sm text-fg">
        {cmp.doneSets} of {cmp.plannedSets} planned sets done · {Math.round(cmp.adherence * 100)}%
      </p>
      <ul className="flex flex-col gap-2 pt-2">
        {cmp.exercises.map((e) => (
          <li key={e.exerciseId} className="text-sm">
            <span className="text-fg">{names.get(e.exerciseId) ?? 'Exercise'}</span>
            {e.unplanned && <span className="text-muted"> · not in plan, {e.extra.length} sets</span>}
            <ul className="text-muted">
              {e.sets.map((s, i) => (
                <li key={i} className="num">
                  {describeTargets([s.target])} → {s.actual ? `${s.actual.weight ?? ''}${s.actual.weight !== undefined ? s.actual.unit : ''} × ${s.actual.reps ?? '—'}` : '—'} · {REPS[s.repsStatus]}
                  {WEIGHT[s.weightStatus] ? `, ${WEIGHT[s.weightStatus]}` : ''}
                </li>
              ))}
              {!e.unplanned && e.extra.length > 0 && <li className="num">+{e.extra.length} extra set{e.extra.length > 1 ? 's' : ''}</li>}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
