import { useEffect, useState } from 'react';
import { profileRepo } from '../../db/repositories';
import { parseBirthYear, parseDays, parseLines, parsePlates, parsePositive, platesText } from '../../domain/profileForm';
import type { Equipment, EquipmentProfile, Profile, TrainingPhase } from '../../domain/types';
import { EQUIPMENT_OPTIONS, labelFor } from '../exercises/options';

const field = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-fg';
const label = 'flex flex-col gap-1 text-sm text-muted';
const PHASES: TrainingPhase[] = ['offseason', 'preseason', 'inseason', 'hypertrophy', 'strength', 'power', 'deload', 'testing'];

interface EqDraft { id: string; name: string; equipment: Equipment[]; maxDumbbell: string; bar: string; plates: string; notes: string }

const toDraft = (e: EquipmentProfile): EqDraft => ({
  id: e.id, name: e.name, equipment: e.equipment, maxDumbbell: e.maxDumbbell ? String(e.maxDumbbell.value) : '', bar: e.barWeight ? String(e.barWeight.value) : '',
  plates: platesText(e.plates), notes: e.notes ?? '',
});

/** The training profile Claude reads: who the user is, goals, limits and equipment. Saved with one button. */
export function ProfileEditor({ onDone }: { onDone: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sport, setSport] = useState('');
  const [position, setPosition] = useState('');
  const [phase, setPhase] = useState<TrainingPhase | ''>('');
  const [days, setDays] = useState('');
  const [goals, setGoals] = useState('');
  const [constraints, setConstraints] = useState('');
  const [height, setHeight] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [sex, setSex] = useState<'' | 'male' | 'female'>('');
  const [eq, setEq] = useState<EqDraft[]>([]);
  const [defaultEq, setDefaultEq] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void profileRepo.get().then((p) => {
      setProfile(p);
      setSport(p.sport ?? '');
      setPosition(p.position ?? '');
      setPhase(p.trainingPhase ?? '');
      setDays(String(p.plannedDaysPerWeek));
      setGoals(p.goals.join('\n'));
      setConstraints(p.constraints.join('\n'));
      setHeight(p.heightCm ? String(p.heightCm) : '');
      setBirthYear(p.birthYear ? String(p.birthYear) : '');
      setSex(p.sex ?? '');
      setEq(p.equipmentProfiles.map(toDraft));
      setDefaultEq(p.defaultEquipmentProfileId ?? '');
    });
  }, []);

  if (!profile) return null;
  const unit = profile.weightUnit;
  const patchEq = (id: string, patch: Partial<EqDraft>) => setEq((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  async function save() {
    const d = parseDays(days);
    if (!d) return setError('Planned days per week must be a whole number from 1 to 7.');
    if (birthYear.trim() && !parseBirthYear(birthYear, new Date().getFullYear())) return setError('Birth year does not look right.');
    if (height.trim() && !parsePositive(height)) return setError('Height must be a number of centimetres.');
    if (eq.some((e) => !e.name.trim())) return setError('Every equipment profile needs a name.');
    const by = parseBirthYear(birthYear, new Date().getFullYear());
    const h = parsePositive(height);
    const next: Partial<Profile> = {
      goals: parseLines(goals), constraints: parseLines(constraints), plannedDaysPerWeek: d,
      equipmentProfiles: eq.map((e) => {
        const md = parsePositive(e.maxDumbbell);
        const bar = parsePositive(e.bar);
        const plates = parsePlates(e.plates, unit);
        return {
          id: e.id, name: e.name.trim(), equipment: e.equipment,
          ...(md ? { maxDumbbell: { value: md, unit } } : {}), ...(bar ? { barWeight: { value: bar, unit } } : {}),
          ...(plates.length ? { plates } : {}), ...(e.notes.trim() ? { notes: e.notes.trim() } : {}),
        };
      }),
    };
    // Optional fields are written explicitly so clearing a field removes it.
    await profileRepo.update({
      ...next,
      sport: sport.trim() || undefined, position: position.trim() || undefined, trainingPhase: phase || undefined,
      birthYear: by, sex: sex || undefined, heightCm: h, defaultEquipmentProfileId: eq.some((e) => e.id === defaultEq) ? defaultEq : eq[0]?.id,
    });
    onDone();
  }

  return (
    <div className="flex min-h-full flex-col gap-3 pb-6">
      <div className="flex items-center justify-between pb-1 pt-6">
        <h1 className="text-4xl uppercase">Training profile</h1>
        <button type="button" onClick={onDone} className="min-h-tap px-2 text-sm text-muted">Cancel</button>
      </div>
      <p className="text-sm text-muted">This goes into the summary you copy for Claude. Leave a field empty to leave it out.</p>

      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Sport
          <input className={field} value={sport} onChange={(e) => setSport(e.target.value)} />
        </label>
        <label className={label}>Position
          <input className={field} value={position} onChange={(e) => setPosition(e.target.value)} />
        </label>
        <label className={label}>Phase
          <select className={field} value={phase} onChange={(e) => setPhase(e.target.value as TrainingPhase | '')}>
            <option value="">Not set</option>
            {PHASES.map((p) => <option key={p} value={p}>{labelFor(p)}</option>)}
          </select>
        </label>
        <label className={label}>Training days per week
          <input className={`${field} num`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className={label}>Birth year
          <input className={`${field} num`} inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
        </label>
        <label className={label}>Height (cm)
          <input className={`${field} num`} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
        </label>
        <label className={label}>Sex
          <select className={field} value={sex} onChange={(e) => setSex(e.target.value as '' | 'male' | 'female')}>
            <option value="">Not set</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
      </div>

      <label className={label}>Goals (one per line)
        <textarea className={`${field} py-2`} rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} />
      </label>
      <label className={label}>Constraints: injuries, schedule, equipment gaps (one per line)
        <textarea className={`${field} py-2`} rows={4} value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="No training Sundays" />
      </label>

      <h2 className="pt-2 text-2xl uppercase">Equipment</h2>
      {eq.map((e) => (
        <div key={e.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
          <label className={label}>Name
            <input className={field} value={e.name} onChange={(ev) => patchEq(e.id, { name: ev.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`${e.name} equipment`}>
            {EQUIPMENT_OPTIONS.map((o) => (
              <button
                key={o} type="button" aria-pressed={e.equipment.includes(o)}
                onClick={() => patchEq(e.id, { equipment: e.equipment.includes(o) ? e.equipment.filter((x) => x !== o) : [...e.equipment, o] })}
                className={`min-h-tap rounded-card border px-3 text-sm ${e.equipment.includes(o) ? 'border-accent text-fg' : 'border-line text-muted'}`}
              >{labelFor(o)}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Heaviest dumbbell ({unit})
              <input className={`${field} num`} inputMode="decimal" value={e.maxDumbbell} onChange={(ev) => patchEq(e.id, { maxDumbbell: ev.target.value })} />
            </label>
            <label className={label}>Bar ({unit})
              <input className={`${field} num`} inputMode="decimal" value={e.bar} onChange={(ev) => patchEq(e.id, { bar: ev.target.value })} />
            </label>
          </div>
          <label className={label}>Plates per side ({unit}, comma separated)
            <input className={`${field} num`} value={e.plates} onChange={(ev) => patchEq(e.id, { plates: ev.target.value })} />
          </label>
          <label className={label}>Notes
            <input className={field} value={e.notes} onChange={(ev) => patchEq(e.id, { notes: ev.target.value })} />
          </label>
          <div className="flex items-center justify-between">
            <label className="flex min-h-tap items-center gap-2 text-sm">
              <input type="radio" name="defaultEq" checked={defaultEq === e.id} onChange={() => setDefaultEq(e.id)} /> Default
            </label>
            {eq.length > 1 && (
              <button type="button" className="min-h-tap px-2 text-sm text-muted" onClick={() => setEq((l) => l.filter((x) => x.id !== e.id))}>Remove</button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button" className="min-h-tap rounded-card border border-line px-3 text-sm"
        onClick={() => setEq((l) => [...l, { id: crypto.randomUUID(), name: 'New place', equipment: ['bodyweight'], maxDumbbell: '', bar: '', plates: '', notes: '' }])}
      >Add equipment profile</button>

      {error && <p role="alert" className="text-sm text-accent-text">{error}</p>}
      <button type="button" onClick={() => void save()} className="min-h-tap rounded-card bg-accent px-4 font-display text-xl uppercase text-white">Save profile</button>
    </div>
  );
}
