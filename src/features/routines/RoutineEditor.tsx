import { useEffect, useState } from 'react';
import { exerciseRepo, routineRepo } from '../../db/repositories';
import { moveItem } from '../../domain/order';
import { defaultTarget, describeTargets, sanitizeExercises } from '../../domain/routine';
import { toggleSupersetLink } from '../../domain/superset';
import type { Exercise, ID, ProgressionRule, Routine, RoutineExercise, SetType, TargetSet } from '../../domain/types';
import { SET_TYPES } from '../../domain/logging';
import { ExerciseBrowser } from '../exercises/ExerciseBrowser';
import { ExerciseForm } from '../exercises/ExerciseForm';

interface EditorProps {
  heading: string;
  nameLabel?: string;
  namePlaceholder?: string;
  saveLabel: string;
  initialName: string;
  initialNotes: string;
  initialItems: RoutineExercise[];
  /** Return an error message to stay on the screen, or nothing when saved. */
  onSave: (value: { name: string; notes: string; exercises: RoutineExercise[] }) => Promise<string | void> | string | void;
  onCancel: () => void;
}

interface Props {
  /** Omit to create a routine. */
  routine?: Routine;
  onDone: () => void;
}

const input = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';
const small = 'min-h-tap w-full rounded-card border border-line bg-surface-2 px-2 text-center text-base text-fg tabular-nums placeholder:text-muted';
const btn = 'min-h-tap min-w-tap rounded-card border border-line px-3 text-sm text-fg';

/** "" -> undefined, else the number (NaN and negatives -> undefined). */
const parse = (v: string): number | undefined => {
  const n = v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Create or edit a routine. */
export function RoutineEditor({ routine, onDone }: Props) {
  return (
    <ExercisesEditor
      heading={routine ? 'Edit routine' : 'New routine'}
      saveLabel="Save routine"
      namePlaceholder="Push A"
      initialName={routine?.name ?? ''}
      initialNotes={routine?.notes ?? ''}
      initialItems={[...(routine?.exercises ?? [])].sort((a, b) => a.order - b.order)}
      onCancel={onDone}
      onSave={async ({ name, notes, exercises }) => {
        if (exercises.length === 0) return 'Add at least one exercise.';
        const fields = { name, exercises, ...(notes ? { notes } : {}) };
        if (routine) await routineRepo.update(routine.id, { ...fields, notes: notes || undefined });
        else await routineRepo.create(fields);
        onDone();
      }}
    />
  );
}

/** Name, notes and exercises with per-set targets (reps or range, weight, RPE) and rest. Shared by routines and planned sessions. */
export function ExercisesEditor({ heading, nameLabel = 'Name', namePlaceholder, saveLabel, initialName, initialNotes, initialItems, onSave, onCancel }: EditorProps) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes);
  const [items, setItems] = useState<RoutineExercise[]>(initialItems);
  const [byId, setById] = useState<Map<ID, Exercise>>(new Map());
  const [sub, setSub] = useState<'none' | 'pick' | 'create'>('none');
  const [error, setError] = useState('');

  useEffect(() => {
    void exerciseRepo.list().then((list) => setById(new Map(list.map((e) => [e.id, e]))));
  }, [sub]);

  const patchItem = (i: number, patch: Partial<RoutineExercise>) => setItems((cur) => cur.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const patchTarget = (i: number, t: number, patch: Partial<TargetSet>) =>
    setItems((cur) => cur.map((e, k) => (k === i ? { ...e, targets: e.targets.map((x, n) => (n === t ? { ...x, ...patch } : x)) } : e)));
  /** Set (or clear, when undefined) a numeric field. */
  const setNum = (i: number, t: number, key: 'reps' | 'repsMax' | 'weight' | 'rpe' | 'durationSec' | 'distanceM', raw: string) => {
    const v = parse(raw);
    setItems((cur) =>
      cur.map((e, k) => {
        if (k !== i) return e;
        return {
          ...e,
          targets: e.targets.map((x, n) => {
            if (n !== t) return x;
            const { [key]: _drop, ...rest } = x;
            return v === undefined ? rest : { ...rest, [key]: v };
          }),
        };
      }),
    );
  };

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Name is required.');
    const msg = await onSave({ name: trimmed, notes: notes.trim(), exercises: sanitizeExercises(items) });
    if (msg) setError(msg);
  }

  if (sub === 'pick') {
    return (
      <ExerciseBrowser
        title="Add exercise"
        onSelect={(e) => {
          const loadModel = e.loadModel;
          const target: TargetSet = loadModel === 'timeDistance' ? { type: 'working', durationSec: 60 } : defaultTarget();
          setItems((cur) => [...cur, { exerciseId: e.id, order: cur.length, targets: [target, { ...target }, { ...target }] }]);
          setSub('none');
        }}
        onCreate={() => setSub('create')}
        onBack={() => setSub('none')}
      />
    );
  }
  if (sub === 'create') return <ExerciseForm onDone={() => setSub('pick')} />;

  return (
    <div className="flex min-h-full flex-col pb-6">
      <div className="flex items-baseline justify-between pb-3 pt-6">
        <h1 className="text-4xl uppercase">{heading}</h1>
        <button type="button" onClick={onCancel} className="min-h-tap px-2 text-sm text-muted">Cancel</button>
      </div>
      <label className="flex flex-col gap-1 pb-3 text-sm text-muted">
        {nameLabel}
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} />
      </label>
      <label className="flex flex-col gap-1 pb-4 text-sm text-muted">
        Notes
        <textarea className={`${input} py-2`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {items.map((it, i) => {
        const ex = byId.get(it.exerciseId);
        const model = ex?.loadModel ?? 'total';
        const timed = model === 'timeDistance';
        const showWeight = model !== 'repsOnly' && !timed;
        return (
          <section key={i} className="mb-4 rounded-card border border-line bg-surface p-3" aria-label={ex?.name ?? 'Deleted exercise'}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-2xl uppercase">
                  {it.supersetGroup && <span className="num mr-2 rounded-card border border-line px-2 text-base text-muted">SS {it.supersetGroup}</span>}
                  {ex?.name ?? 'Deleted exercise'}
                </h2>
                <p className="num text-sm text-muted">{describeTargets(it.targets)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pb-2 pt-2">
              <button type="button" className={btn} aria-label="Move up" disabled={i === 0} onClick={() => setItems((c) => moveItem(c, i, -1))}>↑</button>
              <button type="button" className={btn} aria-label="Move down" disabled={i === items.length - 1} onClick={() => setItems((c) => moveItem(c, i, 1))}>↓</button>
              <button
                type="button"
                className={btn}
                disabled={i === items.length - 1}
                onClick={() => {
                  const list = items.map((e, k) => ({ id: String(k), supersetGroup: e.supersetGroup }));
                  const groups = toggleSupersetLink(list, String(i));
                  setItems((c) => c.map((e, k) => {
                    const { supersetGroup: _g, ...rest } = e;
                    const g = groups[String(k)];
                    return g ? { ...rest, supersetGroup: g } : rest;
                  }));
                }}
              >
                {it.supersetGroup && it.supersetGroup === items[i + 1]?.supersetGroup ? 'Unlink' : 'Superset ↓'}
              </button>
              <button type="button" className={btn} onClick={() => setItems((c) => c.filter((_, k) => k !== i))}>Remove</button>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-muted">
              <span className="w-24 shrink-0">Rest (sec)</span>
              <input
                className={small}
                inputMode="numeric"
                value={it.restSec ?? ''}
                placeholder={ex ? String(ex.defaultRestSec) : 'default'}
                onChange={(e) => {
                  const v = parse(e.target.value);
                  setItems((c) =>
                    c.map((x, k) => {
                      if (k !== i) return x;
                      const { restSec: _r, ...rest } = x;
                      return v === undefined ? rest : { ...rest, restSec: v };
                    }),
                  );
                }}
              />
            </label>
            {!timed && model !== 'repsOnly' && (
              <ProgressionField
                rule={it.progression}
                onChange={(progression) =>
                  setItems((c) =>
                    c.map((x, k) => {
                      if (k !== i) return x;
                      const { progression: _p, ...rest } = x;
                      return progression && progression.kind !== 'none' ? { ...rest, progression } : rest;
                    }),
                  )
                }
              />
            )}
            <div className="flex items-center gap-1 px-1 pb-1 text-xs uppercase text-muted">
              <span className="w-20 shrink-0">Type</span>
              {timed ? (
                <>
                  <span className="flex-1 text-center">Sec</span>
                  <span className="flex-1 text-center">Metres</span>
                </>
              ) : (
                <>
                  <span className="flex-1 text-center">Reps</span>
                  <span className="flex-1 text-center">Max</span>
                  {showWeight && <span className="flex-1 text-center">{ex?.incrementUnit ?? 'lb'}</span>}
                </>
              )}
              <span className="flex-1 text-center">RPE</span>
              <span className="min-w-tap" />
            </div>
            {it.targets.map((t, n) => (
              <div key={n} className="flex items-center gap-1 pb-1">
                <select
                  aria-label={`Set ${n + 1} type`}
                  className="min-h-tap w-20 shrink-0 rounded-card border border-line bg-surface-2 px-1 text-sm text-fg"
                  value={t.type}
                  onChange={(e) => patchTarget(i, n, { type: e.target.value as SetType })}
                >
                  {SET_TYPES.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}
                </select>
                {timed ? (
                  <>
                    <input aria-label={`Set ${n + 1} seconds`} className={small} inputMode="numeric" value={t.durationSec ?? ''} onChange={(e) => setNum(i, n, 'durationSec', e.target.value)} />
                    <input aria-label={`Set ${n + 1} metres`} className={small} inputMode="decimal" value={t.distanceM ?? ''} onChange={(e) => setNum(i, n, 'distanceM', e.target.value)} />
                  </>
                ) : (
                  <>
                    <input aria-label={`Set ${n + 1} reps`} className={small} inputMode="numeric" value={t.reps ?? ''} onChange={(e) => setNum(i, n, 'reps', e.target.value)} />
                    <input aria-label={`Set ${n + 1} max reps`} className={small} inputMode="numeric" value={t.repsMax ?? ''} onChange={(e) => setNum(i, n, 'repsMax', e.target.value)} />
                    {showWeight && <input aria-label={`Set ${n + 1} weight`} className={small} inputMode="decimal" value={t.weight ?? ''} placeholder="last" onChange={(e) => setNum(i, n, 'weight', e.target.value)} />}
                  </>
                )}
                <input aria-label={`Set ${n + 1} RPE`} className={small} inputMode="decimal" value={t.rpe ?? ''} onChange={(e) => setNum(i, n, 'rpe', e.target.value)} />
                <button type="button" aria-label={`Remove set ${n + 1}`} className="min-h-tap min-w-tap text-muted" onClick={() => patchItem(i, { targets: it.targets.filter((_, k) => k !== n) })}>✕</button>
              </div>
            ))}
            <button
              type="button"
              className="mt-1 min-h-tap w-full rounded-card border border-line text-sm text-fg"
              onClick={() => patchItem(i, { targets: [...it.targets, { ...(it.targets[it.targets.length - 1] ?? defaultTarget()) }] })}
            >
              Add set
            </button>
            {showWeight && <p className="pt-1 text-xs text-muted">Weight left blank uses your last session. Max reps makes a range (6–8).</p>}
          </section>
        );
      })}

      <button type="button" onClick={() => setSub('pick')} className="mb-4 min-h-tap rounded-card border border-line bg-surface px-4 text-left text-base text-fg">
        Add exercise
      </button>
      {error && <p role="alert" className="pb-2 text-sm text-accent">{error}</p>}
      <div className="sticky bottom-0 mt-auto bg-bg pt-4">
        <button type="button" onClick={() => void save()} className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

const RULE_LABEL: Record<ProgressionRule['kind'], string> = {
  none: 'No progression',
  doubleProgression: 'Double progression',
  percentE1rm: '% of e1RM',
  rpeTarget: 'RPE target',
};

const RULE_HELP: Record<ProgressionRule['kind'], string> = {
  none: '',
  doubleProgression: 'When every set at your top weight reaches the max reps, add the increment and drop back to the min reps. Otherwise aim one rep higher.',
  percentE1rm: 'Weight = your last session’s best estimated 1RM (Epley) × the percentage, rounded to the exercise increment.',
  rpeTarget: 'Estimates your 1RM from last session’s sets that have an RPE, then picks the weight for the target reps at the target RPE. Log RPE for it to work.',
};

/** Choose how the next session's weight is suggested. The suggestion is shown, never applied silently. */
function ProgressionField({ rule, onChange }: { rule: ProgressionRule | undefined; onChange: (r: ProgressionRule | undefined) => void }) {
  const kind = rule?.kind ?? 'none';
  const numberOr = (v: string, fallback: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  const pick = (k: ProgressionRule['kind']) => {
    if (k === 'none') return onChange(undefined);
    if (k === 'doubleProgression') return onChange({ kind: k, repsMin: 8, repsMax: 12 });
    if (k === 'percentE1rm') return onChange({ kind: k, percent: 0.8 });
    return onChange({ kind: k, rpe: 8 });
  };
  return (
    <div className="pb-2">
      <label className="flex items-center gap-2 pb-1 text-sm text-muted">
        <span className="w-24 shrink-0">Progression</span>
        <select aria-label="Progression rule" className="min-h-tap flex-1 rounded-card border border-line bg-surface-2 px-2 text-sm text-fg" value={kind} onChange={(e) => pick(e.target.value as ProgressionRule['kind'])}>
          {(Object.keys(RULE_LABEL) as ProgressionRule['kind'][]).map((k) => <option key={k} value={k}>{RULE_LABEL[k]}</option>)}
        </select>
      </label>
      {rule?.kind === 'doubleProgression' && (
        <div className="flex gap-2 pb-1">
          <span className="flex min-h-tap items-center text-xs text-muted">Min</span>
          <input aria-label="Min reps" className={small} inputMode="numeric" value={rule.repsMin} onChange={(e) => onChange({ ...rule, repsMin: numberOr(e.target.value, rule.repsMin) })} />
          <span className="flex min-h-tap items-center text-xs text-muted">Max</span>
          <input aria-label="Max reps" className={small} inputMode="numeric" value={rule.repsMax} onChange={(e) => onChange({ ...rule, repsMax: numberOr(e.target.value, rule.repsMax) })} />
        </div>
      )}
      {rule?.kind === 'percentE1rm' && (
        <input aria-label="Percent of e1RM" className={small} inputMode="decimal" value={Math.round(rule.percent * 1000) / 10} onChange={(e) => onChange({ ...rule, percent: Math.min(1.2, numberOr(e.target.value, rule.percent * 100) / 100) })} />
      )}
      {rule?.kind === 'rpeTarget' && (
        <input aria-label="Target RPE" className={small} inputMode="decimal" value={rule.rpe} onChange={(e) => onChange({ ...rule, rpe: Math.min(10, numberOr(e.target.value, rule.rpe)) })} />
      )}
      {RULE_HELP[kind] && <p className="pt-1 text-xs text-muted">{RULE_HELP[kind]}</p>}
    </div>
  );
}
