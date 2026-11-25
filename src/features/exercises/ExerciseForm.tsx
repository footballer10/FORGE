import { useState } from 'react';
import { exerciseRepo } from '../../db/repositories';
import type { Equipment, Exercise, LoadModel, Muscle, MovementPattern, WeightUnit } from '../../domain/types';
import { EQUIPMENT_OPTIONS, LOAD_MODEL_OPTIONS, MUSCLE_OPTIONS, labelFor } from './options';

interface Props {
  /** Omit to create a custom exercise. */
  exercise?: Exercise;
  onDone: () => void;
}

const field = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-fg';
const label = 'flex flex-col gap-1 text-sm text-muted';
const PATTERNS: MovementPattern[] = [
  'squat', 'hinge', 'horizontalPush', 'verticalPush', 'horizontalPull', 'verticalPull',
  'lunge', 'carry', 'core', 'conditioning', 'isolation', 'other',
];

export function ExerciseForm({ exercise, onDone }: Props) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [aliases, setAliases] = useState((exercise?.aliases ?? []).join(', '));
  const [equipment, setEquipment] = useState<Equipment>(exercise?.equipment ?? 'barbell');
  const [loadModel, setLoadModel] = useState<LoadModel>(exercise?.loadModel ?? 'total');
  const [pattern, setPattern] = useState<MovementPattern>(exercise?.pattern ?? 'other');
  const [primary, setPrimary] = useState<Muscle[]>(exercise?.primaryMuscles ?? []);
  const [increment, setIncrement] = useState(String(exercise?.weightIncrement ?? 5));
  const [incUnit, setIncUnit] = useState<WeightUnit>(exercise?.incrementUnit ?? 'lb');
  const [rest, setRest] = useState(String(exercise?.defaultRestSec ?? 90));
  const [unilateral, setUnilateral] = useState(exercise?.unilateral ?? false);
  const [note, setNote] = useState(exercise?.stickyNote ?? '');
  const [error, setError] = useState('');

  const toggle = (m: Muscle) => setPrimary((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Name is required.');
    const clash = await exerciseRepo.findByName(trimmed);
    if (clash && clash.id !== exercise?.id) return setError(`"${clash.name}" already exists.`);
    const inc = Number(increment);
    const restSec = Number(rest);
    if (!(inc > 0)) return setError('Increment must be above 0.');
    if (!(restSec >= 0)) return setError('Rest must be 0 or more seconds.');
    const fields = {
      name: trimmed,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      equipment,
      loadModel,
      pattern,
      primaryMuscles: primary,
      unilateral,
      weightIncrement: inc,
      incrementUnit: incUnit,
      defaultRestSec: Math.round(restSec),
      ...(note.trim() ? { stickyNote: note.trim() } : {}),
    };
    if (exercise) {
      await exerciseRepo.update(exercise.id, { ...fields, stickyNote: note.trim() || undefined });
    } else {
      await exerciseRepo.create({ ...fields, secondaryMuscles: [], source: 'custom' });
    }
    onDone();
  }

  async function remove() {
    if (!exercise) return;
    await exerciseRepo.softDelete(exercise.id);
    onDone();
  }

  const hint = LOAD_MODEL_OPTIONS.find((o) => o.value === loadModel)?.hint;

  return (
    <div className="flex min-h-full flex-col gap-3 pb-6">
      <div className="flex items-center justify-between pb-1 pt-6">
        <h1 className="text-4xl uppercase">{exercise ? 'Edit exercise' : 'New exercise'}</h1>
        <button type="button" onClick={onDone} className="min-h-tap px-2 text-sm text-muted">Cancel</button>
      </div>
      <label className={label}>Name
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={label}>Aliases (comma separated)
        <input className={field} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Flat Bench, BB Bench" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Equipment
          <select className={field} value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {EQUIPMENT_OPTIONS.map((q) => <option key={q} value={q}>{labelFor(q)}</option>)}
          </select>
        </label>
        <label className={label}>Pattern
          <select className={field} value={pattern} onChange={(e) => setPattern(e.target.value as MovementPattern)}>
            {PATTERNS.map((p) => <option key={p} value={p}>{labelFor(p)}</option>)}
          </select>
        </label>
      </div>
      <label className={label}>Load model
        <select className={field} value={loadModel} onChange={(e) => setLoadModel(e.target.value as LoadModel)}>
          {LOAD_MODEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-xs">{hint}</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Increment
          <span className="flex gap-2">
            <input className={`${field} num min-w-0 flex-1`} inputMode="decimal" value={increment} onChange={(e) => setIncrement(e.target.value)} />
            <select className={field} aria-label="Increment unit" value={incUnit} onChange={(e) => setIncUnit(e.target.value as WeightUnit)}>
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </span>
        </label>
        <label className={label}>Rest (seconds)
          <input className={`${field} num`} inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} />
        </label>
      </div>
      <fieldset className="flex flex-col gap-1 text-sm text-muted">
        <legend className="pb-1">Primary muscles</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={primary.includes(m)}
              onClick={() => toggle(m)}
              className={`min-h-tap rounded-card border px-3 text-sm ${primary.includes(m) ? 'border-accent text-fg' : 'border-line text-muted'}`}
            >
              {labelFor(m)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-tap items-center gap-3 text-base text-fg">
        <input type="checkbox" checked={unilateral} onChange={(e) => setUnilateral(e.target.checked)} className="h-5 w-5" />
        One side at a time (unilateral)
      </label>
      <label className={label}>Sticky note (shown whenever logged)
        <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Seat 4, wide grip" />
      </label>
      {error && <p role="alert" className="text-sm text-accent-text">{error}</p>}
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button
          type="button"
          onClick={() => void save()}
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg"
        >
          Save
        </button>
        {exercise && (
          <button type="button" onClick={() => void remove()} className="min-h-tap text-sm text-muted">
            Delete exercise
          </button>
        )}
      </div>
    </div>
  );
}
