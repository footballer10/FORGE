import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fitnessRepo } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { MEASURE_LABEL, changeIsImprovement, editText, formatTime, formatValue, inputUnit, parseValue, summarizeTest } from '../../domain/fitness';
import type { FitnessTest, LengthUnit, TestMeasure, TestResult, TestScoring, WeightUnit } from '../../domain/types';

const field = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
const MEASURES: TestMeasure[] = ['reps', 'timeSec', 'distanceM', 'heightCm', 'weight'];

interface Loaded {
  tests: FitnessTest[];
  results: TestResult[];
  lengthUnit: LengthUnit;
  weightUnit: WeightUnit;
}

function TestDetail({ test, results, data, onChange }: { test: FitnessTest; results: TestResult[]; data: Loaded; onChange: () => void }) {
  const { lengthUnit, weightUnit } = data;
  const [date, setDate] = useState(localDateKey(new Date()));
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const sum = useMemo(() => summarizeTest(results, test.scoring), [results, test.scoring]);
  const fmt = (r: TestResult) => formatValue(test.measure, r.value, lengthUnit, r.unit ?? weightUnit);
  const series = [...sum.history].reverse().map((r) => ({ t: new Date(`${r.date}T12:00:00`).getTime(), v: test.measure === 'distanceM' ? r.value * 100 : r.value }));

  const reset = () => {
    setEditing(null);
    setText('');
    setDate(localDateKey(new Date()));
  };
  async function save() {
    const v = parseValue(test.measure, text, lengthUnit);
    if (v === undefined) {
      setError(test.measure === 'timeSec' ? 'Enter a time like 10:12 or 4.85.' : test.measure === 'reps' ? 'Enter whole reps above 0.' : 'Enter a number above 0.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Pick a date.');
      return;
    }
    setError('');
    if (editing) await fitnessRepo.editResult(editing, { date, value: v });
    else await fitnessRepo.addResult(test.id, date, v, test.measure === 'weight' ? weightUnit : undefined);
    reset();
    onChange();
  }

  return (
    <div className="pb-3">
      {series.length > 1 && (
        <div className="h-40 w-full" aria-label={`${test.name} over time`}>
          <ResponsiveContainer>
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} stroke="rgb(var(--muted))" fontSize={12} />
              <YAxis domain={['auto', 'auto']} width={44} stroke="rgb(var(--muted))" fontSize={12} reversed={test.scoring === 'lowerIsBetter'} tickFormatter={(v: number) => (test.measure === 'timeSec' ? formatTime(v).replace(' s', '') : String(Math.round(v * 10) / 10))} />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--fg))' }}
                labelFormatter={(t) => dayLabel(new Date(Number(t)).toISOString().slice(0, 10))}
                formatter={(v) => [formatValue(test.measure, test.measure === 'distanceM' ? Number(v) / 100 : Number(v), lengthUnit, weightUnit), test.name]}
              />
              <Line type="monotone" dataKey="v" stroke="rgb(var(--accent))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {series.length > 1 && test.scoring === 'lowerIsBetter' && <p className="text-xs text-muted">Axis is flipped: higher on the chart is faster.</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="date" aria-label="Result date" className={`${field} w-40`} value={date} max={localDateKey(new Date())} onChange={(e) => setDate(e.target.value)} />
        <input
          inputMode={test.measure === 'timeSec' ? 'text' : 'decimal'}
          className={`${field} w-36`}
          placeholder={inputUnit(test.measure, lengthUnit, weightUnit)}
          aria-label={`${test.name} result`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" onClick={() => void save()} className="min-h-tap rounded-card bg-accent px-4 text-sm font-medium text-white">
          {editing ? 'Save change' : 'Log result'}
        </button>
        {editing && (
          <button type="button" onClick={reset} className="min-h-tap rounded-card border border-line px-4 text-sm">Cancel</button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-accent-text">{error}</p>}

      {sum.history.length > 0 && (
        <ul className="mt-2 divide-y divide-line text-sm" aria-label={`${test.name} history`}>
          {sum.history.map((r) => (
            <li key={r.id} className="flex min-h-tap items-center gap-2 tabular-nums">
              <span className="w-24 text-muted">{dayLabel(r.date)}</span>
              <span className="flex-1">
                {fmt(r)}
                {sum.best?.id === r.id && sum.history.length > 1 && <span className="ml-2 text-xs text-accent-text">best</span>}
              </span>
              <button
                type="button"
                className="min-h-tap px-2 text-muted"
                onClick={() => {
                  setEditing(r.id);
                  setDate(r.date);
                  setText(editText(test.measure, r.value, lengthUnit));
                }}
              >
                Edit
              </button>
              <button type="button" className="min-h-tap px-2 text-muted" aria-label={`Delete result ${r.date}`} onClick={() => void fitnessRepo.removeResult(r.id).then(onChange)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
      {!test.builtIn && (
        <button type="button" className="mt-1 min-h-tap text-sm text-muted" onClick={() => void fitnessRepo.removeTest(test.id).then(onChange)}>
          Delete this test and its results
        </button>
      )}
      {test.builtIn && test.description && <p className="mt-2 text-xs text-muted">{test.description}</p>}
    </div>
  );
}

function NewTest({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [measure, setMeasure] = useState<TestMeasure>('reps');
  const [scoring, setScoring] = useState<TestScoring>('higherIsBetter');
  const [error, setError] = useState('');
  async function add() {
    if (!name.trim()) {
      setError('Name the test.');
      return;
    }
    await fitnessRepo.addCustom(name, measure, scoring);
    onDone();
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <input className={field} placeholder="Test name" aria-label="Test name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-2">
        <select className={`${field} flex-1`} aria-label="Measure" value={measure} onChange={(e) => setMeasure(e.target.value as TestMeasure)}>
          {MEASURES.map((m) => <option key={m} value={m}>{MEASURE_LABEL[m]}</option>)}
        </select>
        <select className={`${field} flex-1`} aria-label="Better is" value={scoring} onChange={(e) => setScoring(e.target.value as TestScoring)}>
          <option value="higherIsBetter">Higher is better</option>
          <option value="lowerIsBetter">Lower is better</option>
        </select>
      </div>
      {error && <p role="alert" className="text-sm text-accent-text">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void add()} className="min-h-tap rounded-card bg-accent px-4 text-sm font-medium text-white">Add test</button>
        <button type="button" onClick={onDone} className="min-h-tap rounded-card border border-line px-4 text-sm">Cancel</button>
      </div>
    </div>
  );
}

/** Fitness tests and their result history. Values are shown as logged; "best" follows each test's direction. */
export function FitnessPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    void fitnessRepo.load().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [tick]);
  const refresh = () => setTick((t) => t + 1);
  const byTest = useMemo(() => {
    const m = new Map<string, TestResult[]>();
    for (const r of data?.results ?? []) m.set(r.testId, [...(m.get(r.testId) ?? []), r]);
    return m;
  }, [data]);

  if (!data) return null;
  return (
    <section className="mx-4 mt-4 rounded-card border border-line bg-surface p-4" aria-label="Fitness tests">
      <h2 className="font-display text-xl">Fitness tests</h2>
      <ul className="mt-2 divide-y divide-line">
        {data.tests.map((t) => {
          const rs = byTest.get(t.id) ?? [];
          const s = summarizeTest(rs, t.scoring);
          const isOpen = open === t.id;
          const imp = s.changeFromPrevious === undefined ? undefined : changeIsImprovement(t.scoring, s.changeFromPrevious);
          return (
            <li key={t.id}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)} className="flex min-h-tap w-full items-center gap-2 py-2 text-left">
                <span className="flex-1">
                  <span className="block">{t.name}</span>
                  <span className="block text-xs tabular-nums text-muted">
                    {s.latest ? `${formatValue(t.measure, s.latest.value, data.lengthUnit, s.latest.unit ?? data.weightUnit)} · ${dayLabel(s.latest.date)}` : 'No results yet'}
                    {s.best && s.history.length > 1 && s.best.id !== s.latest?.id && ` · best ${formatValue(t.measure, s.best.value, data.lengthUnit, s.best.unit ?? data.weightUnit)}`}
                  </span>
                </span>
                {s.latestIsBest && <span className="text-xs text-accent-text">New best</span>}
                {imp !== undefined && !s.latestIsBest && <span className="text-xs text-muted">{imp ? 'better' : 'worse'} than last</span>}
                <span aria-hidden className="text-muted">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && <TestDetail test={t} results={rs} data={data} onChange={refresh} />}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <NewTest onDone={() => { setAdding(false); refresh(); }} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="min-h-tap text-sm text-muted">+ Custom test</button>
      )}
      <p className="mt-2 text-xs text-muted">
        "Best" is the highest value for reps, distance, height and weight, and the lowest for times. Ties keep the earlier result. Jumps are stored in cm and shown in your length unit.
        No standards or scores are applied; compare against your own history.
      </p>
    </section>
  );
}
