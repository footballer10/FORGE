import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bodyRepo, UNDO_EVENT } from '../../db/repositories';
import { addDays, localDateKey } from '../../domain/calendar';
import { EWMA_ALPHA, TREND_FORMULA, dailyWeights, ewmaTrend, trendChange } from '../../domain/bodyweight';
import type { BodyMetric, WeightUnit } from '../../domain/types';

const field = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';
const n1 = (n: number) => String(Math.round(n * 10) / 10);
const RANGES = [
  { id: 30, label: '30 d' },
  { id: 90, label: '90 d' },
  { id: 365, label: '1 yr' },
  { id: 0, label: 'All' },
];
const sign = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${n1(Math.abs(n))}`;
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Bodyweight log with a smoothed trend. The formula and its inputs are printed under the chart. */
export function BodyweightPanel() {
  const [rows, setRows] = useState<BodyMetric[]>([]);
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [tick, setTick] = useState(0);
  const [range, setRange] = useState(90);
  const [date, setDate] = useState(localDateKey(new Date()));
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(UNDO_EVENT, bump);
    return () => window.removeEventListener(UNDO_EVENT, bump);
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.all([bodyRepo.weighIns(), bodyRepo.unit()]).then(([r, u]) => {
      if (!live) return;
      setRows(r);
      setUnit(u);
    });
    return () => {
      live = false;
    };
  }, [tick]);

  const points = useMemo(() => ewmaTrend(dailyWeights(rows, unit)), [rows, unit]);
  const shown = useMemo(() => {
    if (!range || !points.length) return points;
    const cutoff = addDays(points[points.length - 1]!.date, -range);
    return points.filter((p) => p.date >= cutoff);
  }, [points, range]);
  const last = points[points.length - 1];
  const week = trendChange(points, 7);
  const month = trendChange(points, 30);

  async function save() {
    const v = Number(value.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || v > 1500) {
      setError('Enter a weight above 0.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Pick a date.');
      return;
    }
    setError('');
    if (editing) await bodyRepo.edit(editing, { date, value: v });
    else await bodyRepo.add(date, v, unit);
    setEditing(null);
    setValue('');
    setDate(localDateKey(new Date()));
    setTick((t) => t + 1);
  }
  async function remove(id: string) {
    await bodyRepo.remove(id);
    if (editing === id) setEditing(null);
    setTick((t) => t + 1);
  }
  function startEdit(m: BodyMetric) {
    setEditing(m.id);
    setDate(m.date);
    setValue(String(m.value));
  }

  const list = showAll ? rows : rows.slice(0, 7);

  return (
    <section className="mx-4 mt-4 rounded-card border border-line bg-surface p-4" aria-label="Bodyweight">
      <h2 className="font-display text-xl">Bodyweight</h2>

      {last ? (
        <p className="mt-1 tabular-nums">
          <span className="font-display text-3xl">{n1(last.trend)}</span> <span className="text-muted">{unit} trend</span>
          <span className="ml-2 text-sm text-muted">last weigh-in {n1(last.value)} {unit} · {dayLabel(last.date)}</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">No weigh-ins yet. Log one below; the trend appears after the first.</p>
      )}
      {(week || month) && (
        <p className="mt-1 text-sm tabular-nums text-muted">
          {week && <>7 d: {sign(week.delta)} {unit}</>}
          {week && month && ' · '}
          {month && <>30 d: {sign(month.delta)} {unit}</>}
          <span> (change in trend)</span>
        </p>
      )}

      {shown.length > 1 && (
        <>
          <div className="mt-3 h-52 w-full" aria-label="Bodyweight and trend over time">
            <ResponsiveContainer>
              <LineChart data={shown.map((p) => ({ ...p, t: new Date(`${p.date}T12:00:00`).getTime() }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                <YAxis domain={['auto', 'auto']} width={44} stroke="rgb(var(--muted))" fontSize={12} tickFormatter={(v: number) => n1(v)} />
                <Tooltip
                  contentStyle={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--fg))' }}
                  labelFormatter={(t) => dayLabel(new Date(Number(t)).toISOString().slice(0, 10))}
                  formatter={(v, name) => [`${n1(Number(v))} ${unit}`, name === 'trend' ? 'Trend' : 'Weigh-in']}
                />
                <Line type="monotone" dataKey="value" stroke="rgb(var(--muted))" strokeWidth={1} dot={{ r: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="trend" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div role="radiogroup" aria-label="Chart range" className="mt-2 flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={r.id === range}
                onClick={() => setRange(r.id)}
                className={`min-h-tap rounded-full border px-4 text-sm ${r.id === range ? 'border-fg bg-surface-2 text-fg' : 'border-line text-muted'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="date" aria-label="Weigh-in date" className={`${field} w-40`} value={date} max={localDateKey(new Date())} onChange={(e) => setDate(e.target.value)} />
        <input
          inputMode="decimal"
          className={`${field} w-28`}
          placeholder={`Weight (${unit})`}
          aria-label={`Bodyweight in ${unit}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="button" onClick={() => void save()} className="min-h-tap rounded-card bg-accent px-4 text-sm font-medium text-white">
          {editing ? 'Save change' : 'Log weigh-in'}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setValue('');
              setDate(localDateKey(new Date()));
            }}
            className="min-h-tap rounded-card border border-line px-4 text-sm"
          >
            Cancel
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-accent">{error}</p>}

      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm" aria-label="Weigh-ins">
          {list.map((m) => {
            const v = m.unit === unit ? m.value : null;
            return (
              <li key={m.id} className="flex min-h-tap items-center gap-2 tabular-nums">
                <span className="w-20 text-muted">{dayLabel(m.date)}</span>
                <span className="flex-1">{n1(m.value)} {m.unit}{v === null ? ' (other unit)' : ''}</span>
                <button type="button" onClick={() => startEdit(m)} className="min-h-tap px-2 text-muted">Edit</button>
                <button type="button" onClick={() => void remove(m.id)} className="min-h-tap px-2 text-muted" aria-label={`Delete weigh-in ${m.date}`}>Delete</button>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 7 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-1 min-h-tap text-sm text-muted">
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}

      <p className="mt-3 text-xs text-muted">
        {TREND_FORMULA.replace('0.1', String(EWMA_ALPHA))}. After a gap of g days the step is 1 − 0.9^g. The first weigh-in starts the trend; several weigh-ins on one day are averaged.
        Grey dots are weigh-ins, the red line is the trend. Deleted weigh-ins leave the trend and the strength score at once.
      </p>
    </section>
  );
}
