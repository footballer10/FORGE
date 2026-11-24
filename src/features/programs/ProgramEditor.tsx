import { useState } from 'react';
import { programRepo } from '../../db/repositories';
import { moveItem } from '../../domain/order';
import { duplicateWeek, emptySession, emptyWeek, treeToDraft, weekLabel, type DraftSession, type DraftWeek, type ProgramTree } from '../../domain/program';
import { describeTargets } from '../../domain/routine';
import type { TrainingPhase } from '../../domain/types';
import { ExercisesEditor } from '../routines/RoutineEditor';

interface Props {
  /** Omit to create a program. Editing saves a new version. */
  tree?: ProgramTree;
  /** Called with the saved program's ID, or undefined on cancel. */
  onDone: (savedId?: string) => void;
}

const PHASES: TrainingPhase[] = ['offseason', 'preseason', 'inseason', 'hypertrophy', 'strength', 'power', 'deload', 'testing'];
const input = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';
const btn = 'min-h-tap min-w-tap rounded-card border border-line px-3 text-sm text-fg';
const key = () => crypto.randomUUID();

/** Program draft editor: weeks of planned sessions. Saving an existing program creates a new version with a reason. */
export function ProgramEditor({ tree, onDone }: Props) {
  const [name, setName] = useState(tree?.program.name ?? '');
  const [description, setDescription] = useState(tree?.program.description ?? '');
  const [days, setDays] = useState(tree?.program.daysPerWeek ? String(tree.program.daysPerWeek) : '');
  const [start, setStart] = useState(tree?.program.startDate ?? '');
  const [weeks, setWeeks] = useState<DraftWeek[]>(() => (tree ? treeToDraft(tree) : [{ ...emptyWeek(key()), sessions: [emptySession(key(), 'Day 1')] }]));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ week: number; session: number } | null>(null);

  const patchWeek = (wi: number, patch: Partial<DraftWeek>) => setWeeks((cur) => cur.map((w, i) => (i === wi ? { ...w, ...patch } : w)));
  const patchSession = (wi: number, si: number, patch: Partial<DraftSession>) =>
    patchWeek(wi, { sessions: weeks[wi]!.sessions.map((s, i) => (i === si ? { ...s, ...patch } : s)) });

  if (editing) {
    const s = weeks[editing.week]?.sessions[editing.session];
    if (s) {
      return (
        <ExercisesEditor
          key={s.key}
          heading="Session"
          nameLabel="Session name"
          saveLabel="Done"
          initialName={s.name}
          initialNotes={s.notes ?? ''}
          initialItems={s.exercises}
          onCancel={() => setEditing(null)}
          onSave={({ name: n, notes, exercises }) => {
            const { notes: _drop, ...rest } = s;
            patchSession(editing.week, editing.session, { ...rest, name: n, exercises, ...(notes ? { notes } : {}) });
            setEditing(null);
          }}
        />
      );
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Name is required.');
    if (weeks.length === 0) return setError('Add at least one week.');
    if (tree && !reason.trim()) return setError('Say why you are changing the program (saved as the change reason).');
    const d = Number(days);
    const saved = await programRepo.saveVersion({
      ...(tree ? { previousId: tree.program.id } : {}),
      fields: {
        name: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(Number.isInteger(d) && d > 0 && d <= 7 ? { daysPerWeek: d } : {}),
        ...(start ? { startDate: start } : {}),
      },
      weeks,
      reason: tree ? reason.trim() : 'Created',
    });
    onDone(saved.id);
  }

  return (
    <div className="flex min-h-full flex-col pb-6">
      <div className="flex items-baseline justify-between pb-3 pt-6">
        <h1 className="text-4xl uppercase">{tree ? `Edit v${tree.program.version}` : 'New program'}</h1>
        <button type="button" onClick={() => onDone()} className="min-h-tap px-2 text-sm text-muted">Cancel</button>
      </div>
      <label className="flex flex-col gap-1 pb-3 text-sm text-muted">
        Name
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Strength block" />
      </label>
      <label className="flex flex-col gap-1 pb-3 text-sm text-muted">
        Description
        <textarea className={`${input} py-2`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="flex gap-3 pb-4">
        <label className="flex flex-1 flex-col gap-1 text-sm text-muted">
          Days per week
          <input className={input} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder="4" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-muted">
          Start date
          <input className={input} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
      </div>

      {weeks.map((w, wi) => (
        <section key={w.key} className="mb-4 rounded-card border border-line bg-surface p-3" aria-label={`Week ${wi + 1}`}>
          <h2 className="pb-2 text-2xl uppercase">{weekLabel({ weekNumber: wi + 1, ...(w.phase ? { phase: w.phase } : {}), ...(w.isDeload ? { isDeload: true } : {}) })}</h2>
          <div className="flex items-center gap-2 pb-2">
            <select
              aria-label={`Week ${wi + 1} phase`}
              className="min-h-tap flex-1 rounded-card border border-line bg-surface-2 px-2 text-sm text-fg"
              value={w.phase ?? ''}
              onChange={(e) => {
                const { phase: _p, ...rest } = w;
                setWeeks((cur) => cur.map((x, i) => (i === wi ? (e.target.value ? { ...rest, phase: e.target.value as TrainingPhase } : rest) : x)));
              }}
            >
              <option value="">No phase</option>
              {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="flex min-h-tap items-center gap-2 text-sm text-fg">
              <input type="checkbox" className="h-6 w-6" checked={!!w.isDeload} onChange={(e) => patchWeek(wi, { isDeload: e.target.checked })} />
              Deload
            </label>
          </div>
          <ul className="flex flex-col gap-2 pb-2">
            {w.sessions.map((s, si) => (
              <li key={s.key} className="rounded-card border border-line bg-surface-2 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg uppercase">{s.name}</span>
                  <span className="num text-xs text-muted">{s.exercises.length} exercises</span>
                </div>
                {s.exercises.length > 0 && <p className="num pb-1 text-xs text-muted">{s.exercises.map((e) => describeTargets(e.targets)).join(' | ')}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btn} onClick={() => setEditing({ week: wi, session: si })}>Edit</button>
                  <button type="button" className={btn} aria-label="Move session up" disabled={si === 0} onClick={() => patchWeek(wi, { sessions: moveItem(w.sessions, si, -1) })}>↑</button>
                  <button type="button" className={btn} aria-label="Move session down" disabled={si === w.sessions.length - 1} onClick={() => patchWeek(wi, { sessions: moveItem(w.sessions, si, 1) })}>↓</button>
                  <button type="button" className={btn} onClick={() => patchWeek(wi, { sessions: w.sessions.filter((_, i) => i !== si) })}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => patchWeek(wi, { sessions: [...w.sessions, emptySession(key(), `Day ${w.sessions.length + 1}`)] })}>Add session</button>
            <button type="button" className={btn} onClick={() => setWeeks((cur) => duplicateWeek(cur, wi, key))}>Copy week</button>
            <button type="button" className={btn} aria-label="Move week up" disabled={wi === 0} onClick={() => setWeeks((cur) => moveItem(cur, wi, -1))}>↑</button>
            <button type="button" className={btn} aria-label="Move week down" disabled={wi === weeks.length - 1} onClick={() => setWeeks((cur) => moveItem(cur, wi, 1))}>↓</button>
            <button type="button" className={btn} onClick={() => setWeeks((cur) => cur.filter((_, i) => i !== wi))}>Remove week</button>
          </div>
        </section>
      ))}
      <button type="button" onClick={() => setWeeks((cur) => [...cur, emptyWeek(key())])} className="mb-4 min-h-tap rounded-card border border-line bg-surface px-4 text-left text-base text-fg">
        Add week
      </button>

      {tree && (
        <label className="flex flex-col gap-1 pb-3 text-sm text-muted">
          Why this change? (saved as the reason for v{tree.program.version + 1})
          <textarea className={`${input} py-2`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      {error && <p role="alert" className="pb-2 text-sm text-accent">{error}</p>}
      <div className="sticky bottom-0 mt-auto bg-bg pt-4">
        <button type="button" onClick={() => void save()} className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">
          {tree ? `Save as v${tree.program.version + 1}` : 'Save program'}
        </button>
      </div>
    </div>
  );
}
