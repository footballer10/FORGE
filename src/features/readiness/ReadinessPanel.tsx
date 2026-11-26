import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { readinessRepo } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { READINESS_FORMULA, checkInFor, readinessScore, readinessTrend } from '../../domain/readiness';
import type { ReadinessCheckIn } from '../../domain/types';
import { Chips } from './ReadinessPrompt';

const RANGES = [28, 90];
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** Readiness trends (Progress). The formula and each day's answers are shown. */
export function ReadinessPanel() {
  const [list, setList] = useState<ReadinessCheckIn[]>([]);
  const [range, setRange] = useState(28);
  const [tick, setTick] = useState(0);
  const today = localDateKey(new Date());
  useEffect(() => {
    void readinessRepo.list().then(setList);
  }, [tick]);
  const todays = checkInFor(list, today);
  const [sleep, setSleep] = useState<number>();
  const [sore, setSore] = useState<number>();
  const [energy, setEnergy] = useState<number>();
  useEffect(() => {
    setSleep(todays?.sleepHours);
    setSore(todays?.soreness);
    setEnergy(todays?.energy);
  }, [todays?.id, todays?.updatedAt]);

  const t = readinessTrend(list, today, range);
  const save = async (patch: Partial<ReadinessCheckIn>) => {
    if (todays) await readinessRepo.update(todays.id, patch);
    else await readinessRepo.create({ date: today, ...patch });
    setTick((n) => n + 1);
  };

  return (
    <div className="pb-6">
      <section className="rounded-card border border-line bg-surface p-3">
        <h2 className="text-lg uppercase">Today</h2>
        <Chips label="Sleep last night (hours)" values={[5, 6, 7, 8, 9, 10]} value={sleep} onPick={(v) => { setSleep(v); void save({ sleepHours: v }); }} format={(v) => (v === 5 ? '≤5' : v === 10 ? '10+' : String(v))} />
        <Chips label="Soreness" values={[1, 2, 3, 4, 5]} value={sore} onPick={(v) => { setSore(v); void save({ soreness: v }); }} ends={['None', 'Very sore']} />
        <Chips label="Energy" values={[1, 2, 3, 4, 5]} value={energy} onPick={(v) => { setEnergy(v); void save({ energy: v }); }} ends={['Drained', 'Great']} />
        {todays && readinessScore(todays) && <p className="num mt-3 text-base">Readiness today: {readinessScore(todays)!.score} / 5</p>}
      </section>

      <div className="mt-4 flex gap-2">
        {RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={`min-h-tap flex-1 rounded-card border text-sm ${range === r ? 'border-fg text-fg' : 'border-line text-muted'}`}>
            {r} days
          </button>
        ))}
      </div>
      <div className="num mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Last 7 days" value={t.avg7 !== undefined ? `${t.avg7}` : '—'} />
        <Stat label={`${range}-day avg`} value={t.avgWindow !== undefined ? `${t.avgWindow}` : '—'} />
        <Stat label="Avg sleep" value={t.avgSleepHours !== undefined ? `${t.avgSleepHours} h` : '—'} />
      </div>

      {t.points.length > 1 ? (
        <div className="mt-3 h-48 w-full" aria-label="Readiness over time">
          <ResponsiveContainer>
            <LineChart data={t.points.map((p) => ({ ...p, t: new Date(`${p.date}T12:00:00`).getTime() }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(x: number) => new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} stroke="rgb(var(--muted))" fontSize={12} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} width={28} stroke="rgb(var(--muted))" fontSize={12} />
              <Tooltip
                contentStyle={{ background: 'rgb(var(--surface-2))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--fg))' }}
                labelFormatter={(x) => dayLabel(localDateKey(new Date(Number(x))))}
                formatter={(v) => [`${v} / 5`, 'Readiness']}
              />
              <Line type="monotone" dataKey="score" stroke="rgb(var(--fg))" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Check in on two or more days to see a trend. You are asked once a day when you start a workout.</p>
      )}
      <p className="mt-2 text-xs text-muted">{READINESS_FORMULA}</p>

      {t.points.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-line rounded-card border border-line">
          {[...t.points].reverse().map((p) => (
            <li key={p.date} className="num flex items-center justify-between px-3 py-2 text-sm">
              <span>{dayLabel(p.date)}</span>
              <span className="text-muted">
                {p.sleepHours !== undefined ? `${p.sleepHours} h · ` : ''}
                {p.soreness !== undefined ? `sore ${p.soreness} · ` : ''}
                {p.energy !== undefined ? `energy ${p.energy}` : ''}
              </span>
              <span className="text-base">{p.score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line p-2">
      <div className="text-2xl">{value}</div>
      <div className="font-sans text-xs text-muted">{label}</div>
    </div>
  );
}
