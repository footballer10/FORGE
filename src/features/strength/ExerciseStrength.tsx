import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsRepo, type ExerciseAnalyticsInput } from '../../db/repositories';
import { E1RM_FORMULAS, E1RM_MAX_REPS, formulaInfo } from '../../domain/e1rm';
import { detectPrs, e1rmSeries, liftSets, type PrEvent } from '../../domain/prs';
import type { E1rmFormula, WeightUnit } from '../../domain/types';

const round = (n: number) => Math.round(n * 10) / 10;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

function prText(p: PrEvent, unit: WeightUnit): string {
  if (p.kind === 'rep') return `${p.reps}-rep best: ${round(p.value)} ${unit} (was ${round(p.previous)})`;
  if (p.kind === 'e1rm') return `e1RM: ${round(p.value)} ${unit} (was ${round(p.previous)})`;
  return `Exercise volume: ${Math.round(p.value)} ${unit} (was ${Math.round(p.previous)})`;
}

/** e1RM over time with a formula picker, plus the PR timeline for one exercise. */
export function ExerciseStrength({ exerciseId, onBack }: { exerciseId: string; onBack: () => void }) {
  const [input, setInput] = useState<ExerciseAnalyticsInput | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [formula, setFormula] = useState<E1rmFormula>('epley');

  useEffect(() => {
    let live = true;
    void Promise.all([analyticsRepo.exerciseInput(exerciseId), analyticsRepo.weightUnit(), analyticsRepo.e1rmFormula()]).then(([i, u, f]) => {
      if (!live) return;
      setInput(i ?? null);
      setUnit(u);
      setFormula(f);
    });
    return () => {
      live = false;
    };
  }, [exerciseId]);

  const lifts = useMemo(
    () => (input ? liftSets(input.sets, input.exercise, input.workouts, input.metrics, unit) : []),
    [input, unit],
  );
  const series = useMemo(() => e1rmSeries(lifts, formula).map((p) => ({ ...p, e1rm: round(p.e1rm), t: new Date(p.date).getTime() })), [lifts, formula]);
  const prs = useMemo(() => detectPrs(lifts, formula).reverse(), [lifts, formula]);
  const info = formulaInfo(formula);
  const best = series.reduce<(typeof series)[number] | undefined>((b, p) => (!b || p.e1rm > b.e1rm ? p : b), undefined);

  const pick = (f: E1rmFormula) => {
    setFormula(f);
    void analyticsRepo.setE1rmFormula(f);
  };

  return (
    <div className="pb-6">
      <button type="button" onClick={onBack} className="min-h-tap pt-4 text-sm text-muted">← Strength</button>
      <h1 className="pb-3 text-4xl uppercase">{input?.exercise.name ?? ''}</h1>
      {!input ? null : series.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-4 text-sm text-muted">
          No usable sets. e1RM needs completed non-warm-up sets with weight and 1–{E1RM_MAX_REPS} reps
          {input.exercise.loadModel === 'bodyweightPlusAdded' || input.exercise.loadModel === 'assisted' ? ' and a bodyweight on record' : ''}.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <div className="font-display text-5xl tabular-nums">
              {best ? round(best.e1rm) : 0} <span className="text-xl text-muted">{unit}</span>
            </div>
            <div className="text-sm text-muted">best e1RM</div>
          </div>

          <div className="mt-3 h-56 w-full" aria-label="e1RM over time">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  stroke="rgb(var(--muted))"
                  fontSize={12}
                />
                <YAxis domain={['auto', 'auto']} width={44} stroke="rgb(var(--muted))" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--fg))' }}
                  labelFormatter={(t) => day(new Date(Number(t)).toISOString())}
                  formatter={(v, _n, item) => {
                    const p = item.payload as (typeof series)[number];
                    return [`${v} ${unit} (${round(p.load)} × ${p.reps})`, 'e1RM'];
                  }}
                />
                <Line type="monotone" dataKey="e1rm" stroke="rgb(var(--accent))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div role="radiogroup" aria-label="e1RM formula" className="mt-3 flex flex-wrap gap-2">
            {E1RM_FORMULAS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={f.id === formula}
                onClick={() => pick(f.id)}
                className={`min-h-tap rounded-full border px-4 text-sm ${f.id === formula ? 'border-fg bg-surface-2 text-fg' : 'border-line text-muted'}`}
              >
                {f.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {info.name}: e1RM = {info.formula}. One point per workout: its best set with 1–{E1RM_MAX_REPS} reps (a single is its own max).
            Warm-ups are excluded. Estimates are rough above about 10 reps.
          </p>
        </>
      )}

      {input && (
        <section className="mt-6">
          <h2 className="pb-2 text-2xl uppercase">PR timeline</h2>
          {prs.length === 0 ? (
            <p className="text-sm text-muted">No PRs yet. The first value of each kind is a baseline; a PR must beat an earlier one.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {prs.map((p, i) => (
                <li key={`${p.kind}-${p.reps ?? ''}-${p.date}-${i}`} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
                  <span className="text-sm">{prText(p, unit)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-accent">{day(p.date)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            Rep PR: heaviest load at exactly that many reps (1, 2, 3, 4, 5, 6, 8, 10, 12). e1RM PR: highest estimate with {info.name}. Volume PR: load × reps
            summed over the exercise in one workout. Dumbbells count one implement; bodyweight lifts add or subtract bodyweight.
          </p>
        </section>
      )}
    </div>
  );
}
