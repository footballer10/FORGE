import { useEffect, useState } from 'react';
import { TrapFocus } from '../../components/TrapFocus';
import { bodyRepo, metaRepo, profileRepo, workoutRepo } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { parseDays, parseLines, parsePositive } from '../../domain/profileForm';
import type { LengthUnit, WeightUnit } from '../../domain/types';
import { useWorkout } from '../train/workoutStore';

export const ONBOARDED_KEY = 'onboarded';
const field = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-fg';
const seg = (on: boolean) => `min-h-tap flex-1 rounded-card border px-4 ${on ? 'border-accent text-fg' : 'border-line text-muted'}`;

/** First-run setup: units, bodyweight, goals. Shown once, and never to someone who already has workouts. */
export function Onboarding() {
  const [show, setShow] = useState(false);
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [length, setLength] = useState<LengthUnit>('in');
  const [weight, setWeight] = useState('');
  const [days, setDays] = useState('3');
  const [goals, setGoals] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      if (await metaRepo.get<boolean>(ONBOARDED_KEY)) return;
      if ((await workoutRepo.listHistory(1)).length) {
        await metaRepo.set(ONBOARDED_KEY, true);
        return;
      }
      const p = await profileRepo.get();
      setUnit(p.weightUnit);
      setLength(p.lengthUnit);
      setDays(String(p.plannedDaysPerWeek));
      setGoals(p.goals.join('\n'));
      setShow(true);
    })().catch(() => undefined);
  }, []);

  if (!show) return null;

  async function finish(save: boolean) {
    if (save) {
      const d = parseDays(days);
      if (!d) return setError('Training days must be a whole number from 1 to 7.');
      if (weight.trim() && !parsePositive(weight)) return setError('Bodyweight must be a number.');
      await profileRepo.update({ weightUnit: unit, lengthUnit: length, plannedDaysPerWeek: d, goals: parseLines(goals) });
      const w = parsePositive(weight);
      if (w) await bodyRepo.add(localDateKey(new Date()), w, unit);
      await useWorkout.getState().load();
    }
    await metaRepo.set(ONBOARDED_KEY, true);
    setShow(false);
  }

  return (
    <TrapFocus role="dialog" aria-modal="true" aria-label="Welcome to Forge" className="fixed inset-0 z-50 overflow-y-auto bg-bg px-4 pb-safe pt-safe">
      <div className="mx-auto flex max-w-md flex-col gap-4 pb-8">
        <h1 className="pt-6 text-4xl uppercase">Welcome to Forge</h1>
        <p className="text-sm text-muted">Three quick choices. Everything can be changed later in Settings. Your data stays on this device.</p>

        <div className="flex flex-col gap-1 text-sm text-muted">
          Weight unit
          <div className="flex gap-2" role="group" aria-label="Weight unit">
            {(['lb', 'kg'] as WeightUnit[]).map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} className={seg(unit === u)} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm text-muted">
          Distances
          <div className="flex gap-2" role="group" aria-label="Length unit">
            {([['in', 'in / mi'], ['cm', 'cm / km']] as [LengthUnit, string][]).map(([u, l]) => (
              <button key={u} type="button" aria-pressed={length === u} className={seg(length === u)} onClick={() => setLength(u)}>{l}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Bodyweight today ({unit}), optional
          <input className={`${field} num`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Training days per week
          <input className={`${field} num`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Goals (one per line)
          <textarea className={`${field} py-2`} rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-accent-text">{error}</p>}
        <button type="button" onClick={() => void finish(true)} className="min-h-tap rounded-card bg-accent px-4 font-semibold text-white">Get started</button>
        <button type="button" onClick={() => void finish(false)} className="min-h-tap text-sm text-muted">Skip for now</button>
      </div>
    </TrapFocus>
  );
}
