import { useEffect, useMemo, useState } from 'react';
import { analyticsRepo, type LiftedExercise, type TrainingData } from '../../db/repositories';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { detectPlateau } from '../../domain/volume';
import { e1rmSeries, liftSets } from '../../domain/prs';
import { liftSummary } from '../../domain/liftSummary';
import { localDateKey } from '../../domain/calendar';
import type { E1rmFormula } from '../../domain/types';
import { ExerciseStrength } from './ExerciseStrength';
import { InsightsScreen } from './InsightsScreen';

/** Weeks without an e1RM gain before a lift is flagged. */
export const PLATEAU_WEEKS = 6;

const n0 = (n: number) => String(Math.round(n));

/** Strength tab: your lifts, nothing else. Tap one for its chart and records; extras live under Insights. */
export function StrengthScreen() {
  const [lifts, setLifts] = useState<LiftedExercise[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [insights, setInsights] = useState(false);
  const [data, setData] = useState<{ t: TrainingData; formula: E1rmFormula } | null>(null);

  useEffect(() => {
    let live = true;
    void analyticsRepo.liftedExercises().then((l) => live && setLifts(l));
    void Promise.all([analyticsRepo.trainingData(), analyticsRepo.e1rmFormula()]).then(([t, formula]) => live && setData({ t, formula }));
    return () => {
      live = false;
    };
  }, []);

  const stats = useMemo(() => {
    const out = new Map<string, { summary: ReturnType<typeof liftSummary>; plateau: boolean }>();
    if (!data || !lifts) return out;
    const today = localDateKey(new Date());
    for (const l of lifts) {
      const sets = data.t.sets.filter((s) => s.exerciseId === l.exercise.id);
      const series = e1rmSeries(liftSets(sets, l.exercise, data.t.workouts, data.t.metrics, data.t.unit), data.formula);
      out.set(l.exercise.id, { summary: liftSummary(series, today), plateau: detectPlateau(series, today, PLATEAU_WEEKS).plateau });
    }
    return out;
  }, [data, lifts]);

  if (openId) return <ExerciseStrength exerciseId={openId} onBack={() => setOpenId(null)} />;
  if (insights) return <InsightsScreen onBack={() => setInsights(false)} />;
  if (lifts === null) return null;

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between">
        <ScreenHeader title="Strength" />
        <button type="button" onClick={() => setInsights(true)} className="min-h-tap px-2 text-sm text-muted">Insights</button>
      </div>
      {lifts.length === 0 ? (
        <EmptyState title="No lifts yet" body="Finish a workout with weighted sets and your lifts appear here." />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {lifts.map((l) => {
              const st = stats.get(l.exercise.id);
              const sum = st?.summary;
              return (
                <li key={l.exercise.id}>
                  <button type="button" onClick={() => setOpenId(l.exercise.id)} className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left">
                    <span className="min-w-0">
                      <span className="block truncate text-base font-medium">{l.exercise.name}</span>
                      <span className="block text-sm text-muted">
                        {new Date(l.lastDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {st?.plateau ? ' · plateau' : ''}
                      </span>
                    </span>
                    {sum && (
                      <span className="num shrink-0 text-right">
                        <span className="block text-2xl">{n0(sum.current)} <span className="text-sm text-muted">{data?.t.unit}</span></span>
                        {sum.change !== undefined && sum.change !== 0 && (
                          <span className={`block text-sm ${sum.change > 0 ? 'text-accent-text' : 'text-muted'}`}>{sum.change > 0 ? '+' : '−'}{n0(Math.abs(sum.change))}</span>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Number = best estimated 1RM in the last 4 weeks ({data ? data.formula : 'Epley'} formula), change vs the 4 weeks before. Plateau = no gain in {PLATEAU_WEEKS} weeks.
          </p>
        </>
      )}
    </div>
  );
}
