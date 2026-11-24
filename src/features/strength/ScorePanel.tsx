import { useEffect, useMemo, useState } from 'react';
import { analyticsRepo, type TrainingData } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { bodyweightOn } from '../../domain/load';
import { e1rmSeries, liftSets } from '../../domain/prs';
import { SCORE_FORMULA, SCORE_WINDOW_WEEKS, recentBestE1rm, strengthScore, type ScoreLiftInput } from '../../domain/strengthScore';
import { convertWeight } from '../../domain/units';
import type { E1rmFormula, Profile } from '../../domain/types';
import { ScoreSetup } from './ScoreSetup';

type Setup = Pick<Profile, 'strengthScoreLifts' | 'strengthStandards'>;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const field = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';

/** Strength score card: relative strength of the chosen lifts, with formula, inputs and tiers. */
export function ScorePanel({ data, formula }: { data: TrainingData; formula: E1rmFormula }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [editing, setEditing] = useState(false);
  const [bw, setBw] = useState('');
  const [tick, setTick] = useState(0);
  const [metrics, setMetrics] = useState(data.metrics);
  const today = localDateKey(new Date());

  useEffect(() => {
    let live = true;
    void analyticsRepo.scoreSetup().then((s) => live && setSetup(s));
    return () => {
      live = false;
    };
  }, [editing, tick]);
  useEffect(() => setMetrics(data.metrics), [data.metrics]);

  const bodyweight = useMemo(() => {
    const w = bodyweightOn(today, metrics);
    return w ? convertWeight(w.value, w.unit, data.unit) : undefined;
  }, [metrics, today, data.unit]);

  const result = useMemo(() => {
    if (!setup) return null;
    const inputs: ScoreLiftInput[] = setup.strengthScoreLifts.map((l) => {
      const ex = data.exercises.get(l.exerciseId);
      const sets = data.sets.filter((s) => s.exerciseId === l.exerciseId);
      const series = ex ? e1rmSeries(liftSets(sets, ex, data.workouts, metrics, data.unit), formula) : [];
      return {
        exerciseId: l.exerciseId,
        name: ex?.name ?? 'Deleted exercise',
        weight: l.weight,
        e1rm: recentBestE1rm(series, today),
        standard: setup.strengthStandards.find((x) => x.exerciseId === l.exerciseId)?.thresholds,
      };
    });
    return strengthScore(inputs, bodyweight);
  }, [setup, data, metrics, formula, bodyweight, today]);

  if (editing) return <ScoreSetup onDone={() => setEditing(false)} unit={data.unit} />;
  if (!setup || !result) return null;

  const saveBw = async () => {
    const v = Number(bw);
    if (!(v > 0)) return;
    await analyticsRepo.logBodyweight(today, v, data.unit);
    setMetrics((m) => [...m, { id: `tmp-${Date.now()}`, createdAt: '', updatedAt: '', date: today, kind: 'bodyweight', value: v, unit: data.unit }]);
    setBw('');
    setTick((t) => t + 1);
  };

  return (
    <section className="mb-6 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl uppercase">Strength score</h2>
        <button type="button" onClick={() => setEditing(true)} className="min-h-tap text-sm text-muted underline">
          {setup.strengthScoreLifts.length ? 'Edit lifts' : 'Choose lifts'}
        </button>
      </div>

      {setup.strengthScoreLifts.length === 0 ? (
        <p className="text-sm text-muted">Pick the lifts and weights that make up your score. Each lift is scored as e1RM ÷ bodyweight.</p>
      ) : (
        <>
          <div className="font-display text-5xl tabular-nums">{result.score === undefined ? '—' : Math.round(result.score)}</div>
          {bodyweight === undefined && <p className="text-sm text-muted">Log your bodyweight to get a score.</p>}
          {result.score !== undefined && result.coverage < 1 && (
            <p className="text-sm text-muted">Based on {Math.round(result.coverage * 100)}% of your lift weights; the rest have no e1RM in the last {SCORE_WINDOW_WEEKS} weeks.</p>
          )}
          <ul className="mt-3 flex flex-col gap-2">
            {result.lifts.map((l) => (
              <li key={l.exerciseId} className="rounded-card bg-surface-2 px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{l.name}</span>
                  <span className="tabular-nums text-muted">weight {l.weight}</span>
                </div>
                {l.ratio === undefined ? (
                  <div className="text-muted">{l.e1rm ? 'Needs bodyweight' : `No e1RM in the last ${SCORE_WINDOW_WEEKS} weeks`}</div>
                ) : (
                  <div className="tabular-nums">
                    {Math.round(l.e1rm as number)} {data.unit} ÷ {Math.round(bodyweight as number)} {data.unit} = {l.ratio.toFixed(2)}×
                    {l.standard ? ` · ${l.tier ? cap(l.tier) : 'Below beginner'}` : ' · no standard'}
                    {l.next && l.toNext !== undefined && (
                      <span className="text-muted"> · {Math.ceil(l.toNext)} {data.unit} to {cap(l.next.tier)} ({l.next.ratio.toFixed(2)}×)</span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          inputMode="decimal"
          className={`${field} w-32`}
          placeholder={`Bodyweight (${data.unit})`}
          aria-label={`Bodyweight in ${data.unit}`}
          value={bw}
          onChange={(e) => setBw(e.target.value)}
        />
        <button type="button" onClick={() => void saveBw()} className="min-h-tap rounded-card border border-line px-4 text-sm">
          Log today
        </button>
        {bodyweight !== undefined && <span className="text-sm tabular-nums text-muted">now {Math.round(bodyweight * 10) / 10} {data.unit}</span>}
      </div>

      <p className="mt-3 text-xs text-muted">
        {SCORE_FORMULA}. e1RM = best in the last {SCORE_WINDOW_WEEKS} weeks with the chosen formula; bodyweight = latest weigh-in on or before today.
        Tiers use your editable thresholds (e1RM ÷ bodyweight); the starting values are rough app defaults, not percentiles.
      </p>
    </section>
  );
}
