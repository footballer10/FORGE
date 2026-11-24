import { useEffect, useMemo, useState } from 'react';
import { UNDO_EVENT, workoutRepo } from '../../db/repositories';
import { dayStats, heatLevel, heatmapWeeks, localDateKey, maxHardSets, monthGrid, type DayStat } from '../../domain/calendar';
import { useWorkout } from './workoutStore';
import type { Workout } from '../../domain/types';

const HEAT = ['bg-surface-2', 'bg-accent/25', 'bg-accent/50', 'bg-accent/75', 'bg-accent'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HEAT_WEEKS = 26;

/** Month calendar (tap a day to see its workouts) and a 26-week training-day heatmap. */
export function HistoryCalendar() {
  const openPast = useWorkout((s) => s.openPast);
  const [items, setItems] = useState<{ id: string; startedAt: string; hardSets: number }[] | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const today = localDateKey(new Date());
  const [month, setMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(UNDO_EVENT, bump);
    return () => window.removeEventListener(UNDO_EVENT, bump);
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.all([workoutRepo.dayStatsInput(), workoutRepo.listHistory(5000)]).then(([i, w]) => {
      if (!live) return;
      setItems(i);
      setWorkouts(w);
    });
    return () => {
      live = false;
    };
  }, [tick]);

  const stats = useMemo(() => dayStats(items ?? []), [items]);
  const grid = useMemo(() => monthGrid(month.y, month.m), [month]);
  const weeks = useMemo(() => heatmapWeeks(today, HEAT_WEEKS), [today]);
  const max = useMemo(() => maxHardSets(stats, weeks.flat()), [stats, weeks]);
  if (items === null) return null;

  const label = new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (d: number) => setMonth(({ y, m }) => { const n = new Date(y, m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const dayWorkouts = selected ? workouts.filter((w) => localDateKey(w.startedAt) === selected) : [];
  const cell = (key: string, s?: DayStat) => `${key}: ${s ? `${s.workouts} workout${s.workouts > 1 ? 's' : ''}, ${s.hardSets} hard sets` : 'rest'}`;

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <button type="button" aria-label="Previous month" className="min-h-tap min-w-tap text-fg" onClick={() => shift(-1)}>‹</button>
        <span className="text-lg uppercase">{label}</span>
        <button type="button" aria-label="Next month" className="min-h-tap min-w-tap text-fg" onClick={() => shift(1)}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-muted">{WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={label}>
        {grid.flat().map(({ key, inMonth }) => {
          const s = stats.get(key);
          const lvl = heatLevel(s?.hardSets ?? 0, max);
          return (
            <button
              key={key}
              type="button"
              aria-label={cell(key, s)}
              disabled={!s}
              onClick={() => setSelected(selected === key ? null : key)}
              className={`num min-h-tap rounded text-sm ${HEAT[lvl]} ${inMonth ? 'text-fg' : 'text-muted opacity-40'} ${key === today ? 'ring-1 ring-fg' : ''} ${selected === key ? 'outline outline-2 outline-fg' : ''}`}
            >
              {Number(key.slice(8))}
            </button>
          );
        })}
      </div>
      {selected && (
        <ul className="flex flex-col gap-2 pt-3">
          {dayWorkouts.map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-card border border-line bg-surface p-3">
              <span className="text-lg uppercase">{w.name}</span>
              <button type="button" onClick={() => void openPast(w.id)} className="min-h-tap px-3 text-sm text-fg underline">Open</button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="pb-1 pt-5 text-lg uppercase">Last {HEAT_WEEKS} weeks</h3>
      <div className="flex gap-[2px]" role="img" aria-label={`Training heatmap, ${HEAT_WEEKS} weeks`}>
        {weeks.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col gap-[2px]">
            {col.map((key) => {
              const s = stats.get(key);
              return <span key={key} title={cell(key, s)} className={`aspect-square w-full rounded-sm ${key > today ? 'opacity-0' : HEAT[heatLevel(s?.hardSets ?? 0, max)]}`} />;
            })}
          </div>
        ))}
      </div>
      <p className="pt-2 text-xs text-muted">
        Shade = completed non-warm-up sets that day ÷ your busiest day in the last {HEAT_WEEKS} weeks ({max} sets): above 0, 25%, 50%, 75% make four steps. Weeks start Monday.
      </p>
    </div>
  );
}
