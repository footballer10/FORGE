import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsRepo, type ExerciseAnalyticsInput } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { E1RM_FORMULAS, E1RM_MAX_REPS, formulaInfo } from '../../domain/e1rm';
import { CHART_RANGES, bestPoint, exerciseHistory, inRange, recentPrBadges, repRecords, type ChartRange, type HistoryWorkout } from '../../domain/exerciseHistory';
import { detectPrs, e1rmSeries, liftSets } from '../../domain/prs';
import { convertWeight } from '../../domain/units';
import type { E1rmFormula, LoadModel, WeightUnit } from '../../domain/types';

const round = (n: number) => Math.round(n * 10) / 10;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
const dayLong = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

type Segment = 'history' | 'records' | 'volume';
const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'records', label: 'Records' },
  { id: 'volume', label: 'Volume' },
];

/** How a logged weight reads for a load model: "+10" added, "−20" assisted, "BW" with none. */
function weightText(w: HistoryWorkout['working'][number], unit: WeightUnit, model: LoadModel): string {
  const v = w.weight === undefined ? undefined : round(convertWeight(w.weight, w.unit, unit));
  if (model === 'bodyweightPlusAdded') return v ? `BW +${v}` : 'BW';
  if (model === 'assisted') return v ? `BW −${v}` : 'BW';
  return v === undefined ? '–' : `${v} ${unit}`;
}

/** Per-exercise page: best e1RM and recent PRs, one chart, then History / Records / Volume. */
export function ExerciseStrength({ exerciseId, onBack }: { exerciseId: string; onBack: () => void }) {
  const [input, setInput] = useState<ExerciseAnalyticsInput | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [formula, setFormula] = useState<E1rmFormula>('epley');
  const [range, setRange] = useState<ChartRange>('6m');
  const [segment, setSegment] = useState<Segment>('history');
  const [shown, setShown] = useState(10);

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

  const today = localDateKey(new Date());
  const lifts = useMemo(
    () => (input ? liftSets(input.sets, input.exercise, input.workouts, input.metrics, unit) : []),
    [input, unit],
  );
  const series = useMemo(() => e1rmSeries(lifts, formula), [lifts, formula]);
  const chart = useMemo(
    () => inRange(series, range, today).map((p) => ({ ...p, e1rm: round(p.e1rm), t: new Date(p.date).getTime() })),
    [series, range, today],
  );
  const prs = useMemo(() => detectPrs(lifts, formula), [lifts, formula]);
  const badges = useMemo(() => recentPrBadges(prs, today), [prs, today]);
  const records = useMemo(() => repRecords(lifts), [lifts]);
  const history = useMemo(
    () => (input ? exerciseHistory(input.sets, lifts, (id) => input.workouts.has(id)) : []),
    [input, lifts],
  );
  const best = bestPoint(series);
  const info = formulaInfo(formula);
  const names = input ? new Map([...input.workouts].map(([id, w]) => [id, w.name])) : new Map<string, string>();

  const pick = (f: E1rmFormula) => {
    setFormula(f);
    void analyticsRepo.setE1rmFormula(f);
  };

  return (
    <div className="pb-6">
      <button type="button" onClick={onBack} className="min-h-tap pt-4 text-sm text-muted">← Strength</button>
      <h1 className="pb-2 text-4xl uppercase">{input?.exercise.name ?? ''}</h1>
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
            <div className="text-right text-sm text-muted">best e1RM{best ? <><br />{day(best.date)}</> : null}</div>
          </div>
          {badges.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Recent personal records">
              {badges.map((b) => (
                <li key={b.label} className="rounded-full border border-accent px-3 py-1 text-xs tabular-nums text-accent-text">
                  {b.label} · {day(b.date)}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 h-52 w-full" aria-label="e1RM over time">
            {chart.length === 0 ? (
              <p className="pt-16 text-center text-sm text-muted">No sessions in this range.</p>
            ) : (
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    stroke="rgb(var(--muted))"
                    fontSize={12}
                    tickCount={4}
                  />
                  <YAxis domain={['auto', 'auto']} width={44} stroke="rgb(var(--muted))" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--fg))' }}
                    labelFormatter={(t) => day(new Date(Number(t)).toISOString())}
                    formatter={(v, _n, item) => {
                      const p = item.payload as (typeof chart)[number];
                      return [`${v} ${unit} (${round(p.load)} × ${p.reps})`, 'e1RM'];
                    }}
                  />
                  <Line type="monotone" dataKey="e1rm" stroke="rgb(var(--accent))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div role="radiogroup" aria-label="Chart range" className="mt-2 flex gap-2">
            {CHART_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={r.id === range}
                onClick={() => setRange(r.id)}
                className={`min-h-tap flex-1 rounded-full border text-sm ${r.id === range ? 'border-fg bg-surface-2 text-fg' : 'border-line text-muted'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {info.name}: e1RM = {info.formula}. One point per workout: its best set of 1–12 reps, or, when it had only 13–{E1RM_MAX_REPS}-rep sets, a rough estimate from those. Warm-ups excluded.{' '}
            <label className="whitespace-nowrap">
              Formula{' '}
              <select
                value={formula}
                onChange={(e) => pick(e.target.value as E1rmFormula)}
                className="min-h-tap rounded border border-line bg-surface px-2 text-base text-fg"
              >
                {E1RM_FORMULAS.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
          </p>

          <div role="tablist" aria-label="Exercise detail" className="mt-5 grid grid-cols-3 border-b border-line">
            {SEGMENTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === segment}
                onClick={() => setSegment(s.id)}
                className={`min-h-tap border-b-2 text-sm uppercase tracking-wide ${s.id === segment ? 'border-accent text-fg' : 'border-transparent text-muted'}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="mt-3">
            {segment === 'history' && (
              <>
                <ul className="flex flex-col gap-2">
                  {history.slice(0, shown).map((w) => (
                    <li key={w.workoutId} className="rounded-card border border-line bg-surface px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{dayLong(w.date)}</span>
                        <span className="truncate text-xs text-muted">{names.get(w.workoutId)}</span>
                      </div>
                      <ol className="mt-1 text-sm tabular-nums">
                        {w.working.map((s, i) => (
                          <li key={i} className="flex justify-between">
                            <span>{weightText(s, unit, input.exercise.loadModel)} × {s.reps ?? '–'}{s.type !== 'working' ? ` (${s.type})` : ''}</span>
                            {s.rpe !== undefined && <span className="text-muted">RPE {s.rpe}</span>}
                          </li>
                        ))}
                      </ol>
                      {w.warmups > 0 && <p className="mt-1 text-xs text-muted">+ {w.warmups} warm-up {w.warmups === 1 ? 'set' : 'sets'}</p>}
                    </li>
                  ))}
                </ul>
                {history.length > shown && (
                  <button type="button" onClick={() => setShown(shown + 10)} className="mt-2 min-h-tap w-full rounded-card border border-line text-sm text-muted">
                    Show more
                  </button>
                )}
              </>
            )}

            {segment === 'records' && (
              <>
                {records.length === 0 ? (
                  <p className="text-sm text-muted">No sets at 1, 3, 5, 8 or 10 reps yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {records.map((r) => (
                      <li key={r.reps} className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3">
                        <span className="text-sm">{r.reps} {r.reps === 1 ? 'rep' : 'reps'}</span>
                        <span className="font-display text-2xl tabular-nums">{round(r.load)} <span className="text-sm text-muted">{unit}</span></span>
                        <span className="w-20 text-right text-xs tabular-nums text-muted">{day(r.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted">
                  Heaviest load logged at exactly that many reps. Dumbbells count one implement; bodyweight lifts add or subtract bodyweight.
                </p>
              </>
            )}

            {segment === 'volume' && (
              <>
                <ul className="flex flex-col gap-2">
                  {history.slice(0, shown).map((w) => (
                    <li key={w.workoutId} className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3">
                      <span className="text-sm">{day(w.date)}</span>
                      <span className="text-xs text-muted">{w.working.length} {w.working.length === 1 ? 'set' : 'sets'}</span>
                      <span className="font-display text-2xl tabular-nums">{Math.round(w.volume).toLocaleString()} <span className="text-sm text-muted">{unit}</span></span>
                    </li>
                  ))}
                </ul>
                {history.length > shown && (
                  <button type="button" onClick={() => setShown(shown + 10)} className="mt-2 min-h-tap w-full rounded-card border border-line text-sm text-muted">
                    Show more
                  </button>
                )}
                <p className="mt-2 text-xs text-muted">Volume = load × reps summed over the working sets of one workout. Warm-ups excluded.</p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
