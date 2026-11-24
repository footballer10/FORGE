import { useEffect, useMemo, useState } from 'react';
import { analyticsRepo, bodyRepo, UNDO_EVENT, type TrainingData } from '../../db/repositories';
import { bestByDistance, conditioningRows, formatClock, formatDistance, formatPace, paceUnitFor, sessionSummaries } from '../../domain/conditioning';
import type { LengthUnit } from '../../domain/types';

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

  if (!data || sessions.length === 0) return null;
  const shown = all ? sessions : sessions.slice(0, SHOWN);

  return (
    <section className="mx-4 mt-4 rounded-card border border-line bg-surface p-4" aria-label="Conditioning">
      <h2 className="font-display text-xl">Conditioning</h2>

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

      <h3 className="mt-3 text-sm text-muted">Sessions</h3>
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
      <p className="mt-2 text-xs text-muted">
        Pace = time ÷ distance, per {paceUnit === 'mi' ? 'mile' : 'kilometre'} (from your length unit). Average pace uses only sets with both time and distance
        (total time ÷ total distance). Different distances are never compared: each best is the fastest time at that exact distance.
        Warm-ups are excluded.
      </p>
    </section>
  );
}
