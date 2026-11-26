import { useEffect, useState } from 'react';
import { TrapFocus } from '../../components/TrapFocus';
import { metaRepo, readinessRepo } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { checkInFor } from '../../domain/readiness';
import { isEditingPast, useWorkout } from '../train/workoutStore';

const SKIP_KEY = 'readinessSkippedOn';
const SLEEP = [5, 6, 7, 8, 9, 10];
const SCALE = [1, 2, 3, 4, 5];

export function Chips({ label, values, value, onPick, format, ends }: { label: string; values: number[]; value?: number; onPick: (v: number) => void; format?: (v: number) => string; ends?: [string, string] }) {
  return (
    <fieldset className="mt-3">
      <legend className="text-sm text-muted">{label}</legend>
      <div className="mt-1 flex gap-1">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onPick(v)}
            className={`num min-h-tap flex-1 rounded-card border text-lg ${value === v ? 'border-fg bg-surface-2 text-fg' : 'border-line text-muted'}`}
          >
            {format ? format(v) : v}
          </button>
        ))}
      </div>
      {ends && (
        <div className="mt-0.5 flex justify-between text-xs text-muted">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </fieldset>
  );
}

/** Daily check-in (sleep, soreness, energy) when the first workout of the day starts. About ten seconds; skippable. */
export function ReadinessPrompt() {
  const workout = useWorkout((s) => s.workout);
  const [open, setOpen] = useState(false);
  const [sleep, setSleep] = useState<number>();
  const [sore, setSore] = useState<number>();
  const [energy, setEnergy] = useState<number>();
  const workoutId = workout && !isEditingPast(workout) ? workout.id : undefined;

  useEffect(() => {
    if (!workoutId || !workout) return;
    const today = localDateKey(new Date());
    if (localDateKey(workout.startedAt) !== today) return;
    let live = true;
    void Promise.all([readinessRepo.list(), metaRepo.get<string>(SKIP_KEY)]).then(([list, skipped]) => {
      if (live && skipped !== today && !checkInFor(list, today)) setOpen(true);
    });
    return () => {
      live = false;
    };
    // Once per workout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId]);

  if (!open || !workoutId) return null;
  const today = localDateKey(new Date());
  const skip = () => {
    void metaRepo.set(SKIP_KEY, today);
    setOpen(false);
  };
  const save = () => {
    void readinessRepo.create({
      date: today,
      ...(sleep !== undefined ? { sleepHours: sleep } : {}),
      ...(sore !== undefined ? { soreness: sore } : {}),
      ...(energy !== undefined ? { energy } : {}),
    });
    setOpen(false);
  };
  return (
    <TrapFocus role="dialog" aria-modal="true" aria-label="Daily check-in" className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="pb-safe w-full rounded-t-card border-t border-line bg-surface p-4">
        <h2 className="text-2xl uppercase">How are you today?</h2>
        <Chips label="Sleep last night (hours)" values={SLEEP} value={sleep} onPick={setSleep} format={(v) => (v === 5 ? '≤5' : v === 10 ? '10+' : String(v))} />
        <Chips label="Soreness" values={SCALE} value={sore} onPick={setSore} ends={['None', 'Very sore']} />
        <Chips label="Energy" values={SCALE} value={energy} onPick={setEnergy} ends={['Drained', 'Great']} />
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={skip} className="min-h-tap flex-1 rounded-card border border-line text-base text-muted">Skip today</button>
          <button
            type="button"
            onClick={save}
            disabled={sleep === undefined && sore === undefined && energy === undefined}
            className="num min-h-tap flex-[2] rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </TrapFocus>
  );
}
