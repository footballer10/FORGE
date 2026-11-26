import { useEffect, useMemo, useState } from 'react';
import { analyticsRepo, bodyRepo, UNDO_EVENT, type TrainingData } from '../../db/repositories';
import { bestByDistance, conditioningRows, formatClock, formatDistance, formatPace, paceUnitFor, sessionSummaries } from '../../domain/conditioning';
import type { LengthUnit } from '../../domain/types';
import { CONDITIONING_PRESETS } from '../../domain/conditioningPresets';
import { useWorkout } from '../train/workoutStore';
import { useUi } from '../../app/uiStore';

const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const SHOWN = 5;

/** Time/distance sessions: per-session totals and paces, plus the fastest time at each repeated distance. */
export function ConditioningPanel() {
  const [data, setData] = useState<TrainingData | null>(null);
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('in');
  const [tick, setTick] = useState(0);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(UNDO_EVENT, bump);
    return () => window.removeEventListener(UNDO_EVENT, bump);
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.all([analyticsRepo.trainingData(), bodyRepo.lengthUnit()]).then(([d, u]) => {
      if (!live) return;
      setData(d);
      setLengthUnit(u);
    });
    return () => {
      live = false;
    };
  }, [tick]);

  const paceUnit = paceUnitFor(lengthUnit);
  const rows = useMemo(() => (data ? conditioningRows(data.sets, data.exercises, data.workouts) : []), [data]);
  const sessions = useMemo(() => (data ? sessionSummaries(rows, data.workouts, paceUnit) : []), [rows, data, paceUnit]);
  const bests = useMemo(() => {
    if (!data) return [];
    const ids = [...new Set(rows.map((r) => r.exerciseId))];
    return ids
      .map((id) => ({ id, name: data.exercises.get(id)?.name ?? 'Exercise', list: bestByDistance(rows, id) }))
      .filter((b) => b.list.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, data]);

  if (!data) return null;
  const shown = all ? sessions : sessions.slice(0, SHOWN);

  return (
    <section className="rounded-card border border-line bg-surface p-4" aria-label="Conditioning">
      <QuickStart />
      {sessions.length === 0 && (
        <p className="mt-3 text-sm text-muted">No conditioning logged yet. Start one above: each effort has its distance filled in, you type the time, and the rest timer runs between efforts. Paces and your fastest time at each distance show here afterwards.</p>
      )}
      {sessions.length > 0 && <h2 className="mt-4 font-display text-xl">History</h2>}

      {bests.length > 0 && (
        <div className="mt-2">
          <h3 className="text-sm text-muted">Fastest time at each distance</h3>
          {bests.map((b) => (
            <div key={b.id} className="mt-1 text-sm">
              <div>{b.name}</div>
              <ul className="tabular-nums text-muted">
                {b.list.slice(0, 4).map((d) => (
                  <li key={d.distanceM}>
                    {formatDistance(d.distanceM, lengthUnit)}: <span className="text-fg">{formatClock(d.bestTimeSec)}</span> · {dayLabel(d.date)}
                    {d.count > 1 && ` · ${d.count} efforts`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {sessions.length > 0 && <h3 className="mt-3 text-sm text-muted">Sessions</h3>}
      <ul className="divide-y divide-line">
        {shown.map((s) => (
          <li key={s.workoutId} className="py-2 text-sm">
            <div className="flex justify-between tabular-nums">
              <span>{dayLabel(s.date)} · {s.name}</span>
              <span className="text-muted">
                {s.totalDistanceM > 0 && `${formatDistance(s.totalDistanceM, lengthUnit)} · `}
                {s.totalDurationSec > 0 && formatClock(s.totalDurationSec)}
              </span>
            </div>
            {s.blocks.map((b) => (
              <div key={b.exerciseId} className="mt-1 text-xs tabular-nums text-muted">
                <span className="text-fg">{data.exercises.get(b.exerciseId)?.name ?? 'Exercise'}</span>{' '}
                {b.rows
                  .map((r) => [r.distanceM !== undefined ? formatDistance(r.distanceM, lengthUnit) : '', r.durationSec !== undefined ? formatClock(r.durationSec) : ''].filter(Boolean).join(' in '))
                  .join(' · ')}
                {b.avgPaceSec !== undefined && ` · avg ${formatPace(b.avgPaceSec, paceUnit)}`}
                {b.fastestPaceSec !== undefined && b.rows.length > 1 && ` · fastest ${formatPace(b.fastestPaceSec, paceUnit)}`}
              </div>
            ))}
          </li>
        ))}
      </ul>
      {sessions.length > SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="min-h-tap text-sm text-muted">
          {all ? 'Show fewer' : `Show all ${sessions.length}`}
        </button>
      )}
      {sessions.length > 0 && <p className="mt-2 text-xs text-muted">
        Pace = time ÷ distance, per {paceUnit === 'mi' ? 'mile' : 'kilometre'} (from your length unit). Average pace uses only sets with both time and distance
        (total time ÷ total distance). Different distances are never compared: each best is the fastest time at that exact distance.
        Warm-ups are excluded.
      </p>}
    </section>
  );
}

/** One tap starts a session with the distances and rests filled in. */
function QuickStart() {
  const active = useWorkout((s) => !!s.workout);
  const start = useWorkout((s) => s.startConditioningPreset);
  return (
    <div>
      <h2 className="font-display text-xl">Start a session</h2>
      {active && <p className="text-sm text-muted">Finish the workout that is open first.</p>}
      <div className="mt-2 flex flex-col gap-2">
        {CONDITIONING_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={active}
            onClick={() => void start(p).then((ok) => ok && useUi.getState().setTab('train'))}
            className="flex min-h-tap items-center justify-between rounded-card border border-line px-3 py-2 text-left disabled:opacity-50"
          >
            <span className="text-base">{p.name}</span>
            <span className="text-sm text-muted">{p.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
