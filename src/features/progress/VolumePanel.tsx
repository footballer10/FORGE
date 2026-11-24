import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { analyticsRepo, UNDO_EVENT, type TrainingData } from '../../db/repositories';
import { addDays, localDateKey } from '../../domain/calendar';
import { PRIMARY_WEIGHT, SECONDARY_WEIGHT, compareWindows, periodWindows, totalsBetween, volumeSets, weeklyTotals, type PeriodPreset } from '../../domain/volume';

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: '3m', label: '3 mo' },
  { id: '6m', label: '6 mo' },
  { id: '12m', label: '12 mo' },
];
const WEEKS = 8;
const n1 = (n: number) => String(Math.round(n * 10) / 10);
const short = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Pills<T extends string>({ items, value, onPick, label }: { items: { id: T; label: string }[]; value: T; onPick: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          role="radio"
          aria-checked={i.id === value}
          onClick={() => onPick(i.id)}
          className={`min-h-tap rounded-full border px-4 text-sm ${i.id === value ? 'border-fg bg-surface-2 text-fg' : 'border-line text-muted'}`}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

/** Weekly hard sets per muscle and period comparisons. Formula and window dates are always shown. */
export function VolumePanel() {
  const [data, setData] = useState<TrainingData | null>(null);
  const [tick, setTick] = useState(0);
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [weekIdx, setWeekIdx] = useState(WEEKS - 1);
  const today = localDateKey(new Date());

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(UNDO_EVENT, bump);
    return () => window.removeEventListener(UNDO_EVENT, bump);
  }, []);
  useEffect(() => {
    let live = true;
    void analyticsRepo.trainingData().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [tick]);

  const sets = useMemo(() => (data ? volumeSets(data.sets, data.exercises, data.workouts, data.metrics, data.unit) : []), [data]);
  const weeks = useMemo(() => weeklyTotals(sets, today, WEEKS), [sets, today]);
  const win = useMemo(() => periodWindows(today, preset), [today, preset]);
  const cur = useMemo(() => totalsBetween(sets, win.current.from, win.current.to), [sets, win]);
  const prev = useMemo(() => totalsBetween(sets, win.previous.from, win.previous.to), [sets, win]);
  const rows = useMemo(() => compareWindows(cur, prev), [cur, prev]);
  if (!data) return null;
  if (sets.length === 0) return <EmptyState title="Nothing tracked yet" body="Weekly hard sets per muscle and period comparisons appear here after your first finished workout." />;

  const week = weeks[weekIdx]!;
  const muscles = [...week.totals.byMuscle.entries()].sort((a, b) => b[1] - a[1]);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.totals.sets));
  const maxMuscle = Math.max(1, ...muscles.map(([, v]) => v));
  const range = (w: { from: string; to: string }) => `${short(w.from)} – ${short(addDays(w.to, -1))}`;
  const unassigned = week.totals.unassigned;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="pb-2 text-2xl uppercase">Weekly hard sets</h2>
        <div className="flex h-24 items-end gap-1" aria-label="Hard sets per week">
          {weeks.map((w, i) => (
            <button
              key={w.week}
              type="button"
              aria-label={`Week of ${short(w.week)}: ${w.totals.sets} sets`}
              onClick={() => setWeekIdx(i)}
              className="flex h-full min-w-tap flex-1 items-end"
            >
              <span
                className={`w-full rounded-t ${i === weekIdx ? 'bg-accent' : 'bg-surface-2'}`}
                style={{ height: `${Math.max(2, (w.totals.sets / maxWeek) * 100)}%` }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
          <span>{short(weeks[0]!.week)}</span>
          <span>{short(weeks[WEEKS - 1]!.week)}</span>
        </div>
        <p className="pt-3 text-sm">
          Week of {short(week.week)}: <span className="tabular-nums">{week.totals.sets}</span> hard sets
        </p>
        {muscles.length === 0 ? (
          <p className="text-sm text-muted">No sets with muscles assigned this week.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {muscles.map(([m, v]) => (
              <li key={m} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0">{cap(m)}</span>
                <span className="h-2 flex-1 rounded bg-surface-2">
                  <span className="block h-2 rounded bg-fg/70" style={{ width: `${(v / maxMuscle) * 100}%` }} />
                </span>
                <span className="w-10 text-right tabular-nums">{n1(v)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          Hard set = completed, non-warm-up set. A primary muscle gets {PRIMARY_WEIGHT} per set, a secondary muscle {SECONDARY_WEIGHT}. Weeks start Monday.
          {unassigned > 0 && ` ${unassigned} set${unassigned > 1 ? 's' : ''} this week are on exercises with no muscles assigned (edit them in the library).`}
        </p>
      </section>

      <section>
        <h2 className="pb-2 text-2xl uppercase">Compare periods</h2>
        <Pills items={PRESETS} value={preset} onPick={setPreset} label="Comparison period" />
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {[{ w: win.label, r: range(win.current), t: cur }, { w: win.previousLabel, r: range(win.previous), t: prev }].map((c) => (
            <div key={c.w} className="rounded-card border border-line bg-surface p-3">
              <div className="text-xs text-muted">{c.w}</div>
              <div className="text-xs tabular-nums text-muted">{c.r}</div>
              <div className="pt-1 font-display text-3xl tabular-nums">{c.t.sets} <span className="text-base text-muted">sets</span></div>
              <div className="text-xs tabular-nums text-muted">{Math.round(c.t.volume).toLocaleString()} {data.unit} volume</div>
            </div>
          ))}
        </div>
        {rows.length > 0 && (
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-normal">Muscle</th>
                <th className="text-right font-normal">Now</th>
                <th className="text-right font-normal">Before</th>
                <th className="text-right font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.muscle} className="border-t border-line">
                  <td className="py-1.5 font-sans">{cap(r.muscle)}</td>
                  <td className="text-right">{n1(r.current)}</td>
                  <td className="text-right">{n1(r.previous)}</td>
                  <td className="text-right">{r.delta > 0 ? '+' : ''}{n1(r.delta)}{r.percent !== undefined ? ` (${r.percent > 0 ? '+' : ''}${Math.round(r.percent)}%)` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-muted">
          Totals are weighted hard sets in each window (not per week), so windows of different length are not like for like. Volume = load × reps over sets with a known load;
          dumbbells count one implement. Change = now − before; percent is shown when before is above 0.
        </p>
      </section>
    </div>
  );
}
