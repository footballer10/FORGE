import { useEffect, useMemo, useState } from 'react';
import { analyticsRepo, type LiftedExercise, type TrainingData } from '../../db/repositories';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { detectPlateau } from '../../domain/volume';
import { e1rmSeries, liftSets } from '../../domain/prs';
import { localDateKey } from '../../domain/calendar';
import type { E1rmFormula } from '../../domain/types';
import { ScorePanel } from './ScorePanel';
import { ExerciseStrength } from './ExerciseStrength';

/** Strength tab: lifts you have trained; tap one for its e1RM chart and PRs. */
/** Weeks without an e1RM gain before a lift is flagged. */
export const PLATEAU_WEEKS = 6;

export function StrengthScreen() {
  const [lifts, setLifts] = useState<LiftedExercise[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<{ t: TrainingData; formula: E1rmFormula } | null>(null);

  useEffect(() => {
    let live = true;
    void analyticsRepo.liftedExercises().then((l) => live && setLifts(l));
    void Promise.all([analyticsRepo.trainingData(), analyticsRepo.e1rmFormula()]).then(([t, formula]) => live && setData({ t, formula }));
    return () => {
      live = false;
    };
  }, []);

  const plateaus = useMemo(() => {
    const out = new Map<string, ReturnType<typeof detectPlateau>>();
    if (!data || !lifts) return out;
    const today = localDateKey(new Date());
    for (const l of lifts) {
      const sets = data.t.sets.filter((s) => s.exerciseId === l.exercise.id);
      const series = e1rmSeries(liftSets(sets, l.exercise, data.t.workouts, data.t.metrics, data.t.unit), data.formula);
      const r = detectPlateau(series, today, PLATEAU_WEEKS);
      if (r.plateau) out.set(l.exercise.id, r);
    }
    return out;
  }, [data, lifts]);

  if (openId) return <ExerciseStrength exerciseId={openId} onBack={() => setOpenId(null)} />;
  if (lifts === null) return null;

  return (
    <div className="pb-6">
      <ScreenHeader title="Strength" />
      {data && <ScorePanel data={data.t} formula={data.formula} />}
      {lifts.length === 0 ? (
        <EmptyState title="No lifts yet" body="e1RM charts and PRs appear here once you have finished a workout with weighted sets." />
      ) : (
        <ul className="flex flex-col gap-2">
          {lifts.map((l) => (
            <li key={l.exercise.id}>
              <button
                type="button"
                onClick={() => setOpenId(l.exercise.id)}
                className="flex min-h-tap w-full items-center justify-between rounded-card border border-line bg-surface px-4 py-3 text-left"
              >
                <span className="text-base font-medium">
                  {l.exercise.name}
                  {plateaus.has(l.exercise.id) && (
                    <span className="block text-xs font-normal text-muted">
                      Plateau: no e1RM gain in {PLATEAU_WEEKS} weeks (best {Math.round(plateaus.get(l.exercise.id)!.bestBefore)} {data?.t.unit} on {plateaus.get(l.exercise.id)!.since}, {plateaus.get(l.exercise.id)!.sessionsInWindow} sessions since)
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {l.sets} sets · {new Date(l.lastDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lifts.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Plateau = best e1RM (your chosen formula) in the last {PLATEAU_WEEKS} weeks does not beat the best before that, with at least 3 sessions in the window
          (a lay-off is not a plateau).
        </p>
      )}
    </div>
  );
}
