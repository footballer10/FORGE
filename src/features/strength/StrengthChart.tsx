import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsRepo, profileRepo, type StrengthLift } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { CHART_RANGES, inRange, type ChartRange } from '../../domain/exerciseHistory';
import { strengthIndex } from '../../domain/strengthIndex';
import type { ID, WeightUnit } from '../../domain/types';

const OVERALL = 'overall';
const r1 = (n: number) => Math.round(n * 10) / 10;
const short = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Top of the Strength tab: one chart. "Overall strength" (the default) averages how much each chosen lift
 * has improved since it started (100 = start); any single lift shows its estimated 1RM per workout.
 */
export function StrengthChart({ unit }: { unit: WeightUnit }) {
  const [lifts, setLifts] = useState<StrengthLift[] | null>(null);
  const [chosen, setChosen] = useState<ID[] | undefined>(undefined);
  const [pick, setPick] = useState<string>(OVERALL);
  const [range, setRange] = useState<ChartRange>('3m');
  useEffect(() => {
    let live = true;
    void Promise.all([analyticsRepo.strengthLifts(), profileRepo.get()]).then(([l, p]) => {
      if (!live) return;
      setLifts(l);
      setChosen(p.overallLifts);
    });
    return () => {
      live = false;
    };
  }, []);

  const today = localDateKey(new Date());
  const data = useMemo(() => {
    if (!lifts) return [];
    if (pick === OVERALL) {
      const ids = new Set(chosen ?? lifts.map((l) => l.exercise.id));
      const idx = strengthIndex(new Map(lifts.filter((l) => ids.has(l.exercise.id)).map((l) => [l.exercise.id, l.series])), today);
      return inRange(idx, range, today).map((p) => ({ t: new Date(`${p.date}T12:00:00`).getTime(), v: p.index, note: `${p.lifts} ${p.lifts === 1 ? 'lift' : 'lifts'}` }));
    }
    const lift = lifts.find((l) => l.exercise.id === pick);
    return inRange(lift?.series ?? [], range, today).map((p) => ({ t: new Date(p.date).getTime(), v: r1(p.e1rm), note: `${r1(p.load)} × ${p.reps}${p.rough ? ', rough' : ''}` }));
  }, [lifts, chosen, pick, range, today]);

  if (!lifts || lifts.length === 0) return null;
  const overall = pick === OVERALL;
  const latest = data.at(-1)?.v;
  const first = data[0]?.v;
  const change = latest !== undefined && first !== undefined ? r1(latest - first) : undefined;

  return (
    <section className="mb-4 rounded-card border border-line bg-surface p-3" aria-label="Strength chart">
      <select
        aria-label="Chart"
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="min-h-tap w-full rounded-card border border-line bg-bg px-3 text-base text-fg"
      >
        <option value={OVERALL}>Overall strength</option>
        {lifts.map((l) => (
          <option key={l.exercise.id} value={l.exercise.id}>{l.exercise.name}</option>
        ))}
      </select>
      <div className="flex items-baseline justify-between pt-2">
        <span className="num text-3xl">{latest === undefined ? '—' : latest}<span className="text-base text-muted">{overall ? '' : ` ${unit}`}</span></span>
        {change !== undefined && change !== 0 && (
          <span className={`num text-base ${change > 0 ? 'text-accent-text' : 'text-muted'}`}>{change > 0 ? '+' : '−'}{Math.abs(change)}{overall ? ' points' : ` ${unit}`} in range</span>
        )}
      </div>
      <div className="mt-1 h-44 w-full">
        {data.length === 0 ? (
          <p className="pt-14 text-center text-sm text-muted">Nothing logged in this range.</p>
        ) : (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={short} stroke="rgb(var(--muted))" fontSize={12} tickCount={4} />
              <YAxis domain={['auto', 'auto']} width={40} stroke="rgb(var(--muted))" fontSize={12} />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--fg))' }}
                labelFormatter={(t) => short(Number(t))}
                formatter={(v, _n, item) => [`${v}${overall ? '' : ` ${unit}`} (${(item.payload as { note: string }).note})`, overall ? 'Strength index' : 'Estimated 1RM']}
              />
              <Line type="monotone" dataKey="v" stroke="rgb(var(--accent))" strokeWidth={2} dot={overall ? false : { r: 3 }} isAnimationActive={false} />
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
        {overall
          ? '100 = where you started. Each chosen lift counts equally: its best estimated 1RM over the last 4 weeks compared with its first. Choose the lifts in Settings.'
          : 'Estimated 1RM = weight × (1 + reps ÷ 30) from the best set of each workout.'}
      </p>
    </section>
  );
}
