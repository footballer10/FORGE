import { Fragment, useEffect, useState } from 'react';
import { Keypad } from '../../components/Keypad';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { convertWeight, metresTo, toMetres } from '../../domain/units';
import { plateLine } from '../../domain/plates';
import { displayWeight } from '../../domain/load';
import { fieldsFor, inUnit, suggestionTarget, type SetField } from '../../domain/logging';
import { describeTargets } from '../../domain/routine';
import { collapsedSummary, currentExerciseId, foldWarmups } from '../../domain/workoutView';
import type { EquipmentProfile, ID, SetEntry } from '../../domain/types';
import { SetRow } from './SetRow';
import { ExerciseSheet } from './ExerciseSheet';
import { SetSheet } from './SetSheet';
import { PlateSheet } from './PlateSheet';
import { ReorderSheet } from './ReorderSheet';
import { DetailsEditor } from './DetailsEditor';
import { isEditingPast, useWorkout, type ExerciseRow } from './workoutStore';

interface Props {
  onAddExercise: () => void;
  /** Open the picker to replace this workout exercise. */
  onSwapExercise: (workoutExerciseId: ID) => void;
}

const WEIGHT_HEADER: Record<string, string> = {
  total: 'Weight',
  perImplement: 'Each',
  bodyweightPlusAdded: 'Added',
  assisted: 'Assist',
};
const FIELD_LABEL: Record<SetField, string> = { weight: 'Weight', reps: 'Reps', durationSec: 'Seconds', distanceM: 'Metres' };

function Elapsed({ startedAt }: { startedAt: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return <span className="num text-2xl text-muted">{h ? `${h}:${String(m).padStart(2, '0')}` : m}:{String(s).padStart(2, '0')}</span>;
}

/** The logging screen. No gamification here (CLAUDE.md). */
export function ActiveWorkout({ onAddExercise, onSwapExercise }: Props) {
  const {
    prSetIds, workout, rows, unit, updateSet, toggleComplete, fillSuggested, addWarmups, addSet, removeSet, removeExercise, finish, discard,
    setWorkoutNotes, setExerciseNote, setStickyNote, setExerciseOrder, toggleSuperset, showPairTotal, equipment, distUnit, platesInline,
  } = useWorkout();
  const [edit, setEdit] = useState<{ setId: ID; field: SetField } | null>(null);
  const [details, setDetails] = useState<ID | null>(null);
  const [menu, setMenu] = useState<ID | null>(null);
  const [plates, setPlates] = useState<ID | null>(null);
  const [reordering, setReordering] = useState(false);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<'discard' | 'remove' | null>(null);
  // Cards: the first unfinished exercise is open, the rest are collapsed; tapping a title overrides that.
  const [openOverride, setOpenOverride] = useState<Record<ID, boolean>>({});
  const [warmOpen, setWarmOpen] = useState<Record<ID, boolean>>({});

  if (!workout) return null;
  const editing = isEditingPast(workout);
  const currentId = currentExerciseId(rows.map((r) => ({ id: r.we.id, sets: r.sets })));

  const editRow = edit ? rows.find((r) => r.sets.some((s) => s.id === edit.setId)) : undefined;
  const editSet = editRow?.sets.find((s) => s.id === edit?.setId);
  const detailRow = details ? rows.find((r) => r.sets.some((s) => s.id === details)) : undefined;
  const detailSet = detailRow?.sets.find((s) => s.id === details);
  const menuIndex = rows.findIndex((r) => r.we.id === menu);
  const plateRow = plates ? rows.find((r) => r.we.id === plates) : undefined;
  const menuRow = menuIndex >= 0 ? rows[menuIndex] : undefined;

  const fieldLabel = (f: SetField) => (f === 'distanceM' && distUnit === 'yd' ? 'Yards' : FIELD_LABEL[f]);
  const stepFor = (row: ExerciseRow, field: SetField): number => {
    if (field === 'weight') return Math.round(convertWeight(row.exercise.weightIncrement, row.exercise.incrementUnit, unit) * 100) / 100;
    if (field === 'durationSec') return 5;
    if (field === 'distanceM') return distUnit === 'yd' ? 10 : 50;
    return 1;
  };

  const onFinish = async () => {
    setEdit(null);
    const ok = await finish();
    if (!ok) setMessage('Tick off at least one set to finish, or discard the workout.');
  };

  const onDiscard = async () => {
    if (editing) {
      setEdit(null);
      await discard();
    } else setConfirm('discard');
  };

  return (
    <div className="flex min-h-full flex-col pb-6" style={{ paddingBottom: edit ? 340 : undefined }}>
      <div className="flex items-baseline justify-between pb-3 pt-6">
        <h1 className="text-4xl uppercase">{workout.name}</h1>
        {editing ? <span className="text-sm text-muted">Editing · {new Date(workout.startedAt).toLocaleDateString()}</span> : <Elapsed startedAt={workout.startedAt} />}
      </div>
      {editing && <DetailsEditor workout={workout} />}

      {rows.length === 0 && <p className="py-4 text-sm text-muted">Add your first exercise to start logging.</p>}

      {rows.map((row) => {
        const fields = fieldsFor(row.exercise.loadModel);
        const id = row.we.id;
        const open = openOverride[id] ?? id === currentId;
        const toggleOpen = () => {
          setEdit(null);
          setOpenOverride((o) => ({ ...o, [id]: !open }));
        };
        const fold = foldWarmups(row.sets, !!warmOpen[id]);
        const warmIdx = row.sets.flatMap((x, i) => (x.type === 'warmup' ? [i] : []));
        const allWarmDone = warmIdx.length > 0 && warmIdx.every((i) => row.sets[i]!.completedAt);
        const title = (
          <>
            {row.we.supersetGroup && <span className="num mr-2 rounded-card border border-line px-2 text-base text-muted" aria-label={`Superset ${row.we.supersetGroup}`}>SS {row.we.supersetGroup}</span>}
            {row.exercise.name}
          </>
        );
        if (!open) {
          return (
            <section key={id} className="mb-2 rounded-card border border-line bg-surface" aria-label={row.exercise.name}>
              <button type="button" onClick={toggleOpen} aria-expanded={false} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-3 py-2 text-left">
                <span className="text-2xl uppercase">{title}</span>
                <span className="num text-sm text-muted">{collapsedSummary(row.sets.map((x) => inUnit(x, unit)), row.exercise.loadModel, unit)}</span>
              </button>
            </section>
          );
        }
        return (
          <section key={id} className="mb-4 rounded-card border border-line bg-surface p-3" aria-label={row.exercise.name}>
            <div className="flex items-start justify-between gap-2 pb-2">
              <div className="min-w-0 flex-1">
                <button type="button" onClick={toggleOpen} aria-expanded className="min-h-tap text-left">
                  <h2 className="text-2xl uppercase">{title}</h2>
                </button>
                {row.exercise.stickyNote && <p className="whitespace-pre-line text-sm text-muted">{row.exercise.stickyNote}</p>}
                {row.we.targets && <p className="num text-sm text-muted">Target {describeTargets(row.we.targets)}</p>}
                {row.we.suggested && suggestionTarget(row.sets) ? (
                  <div className="py-1">
                    <button type="button" onClick={() => void fillSuggested(row.we.id)} className="num min-h-tap rounded-card border border-line bg-surface-2 px-3 text-sm text-fg">
                      Suggested {Math.round(convertWeight(row.we.suggested.weight, row.we.suggested.unit, unit) * 100) / 100} {unit}{row.we.suggested.reps !== undefined ? ` × ${row.we.suggested.reps}` : ''} · tap to fill
                    </button>
                    {row.we.progressionNote && <p className="text-sm text-muted">{row.we.progressionNote}</p>}
                  </div>
                ) : (
                  row.we.progressionNote && <p className="text-sm text-muted">{row.we.progressionNote}</p>
                )}
                {row.we.notes && <p className="whitespace-pre-line text-sm text-fg">{row.we.notes}</p>}
              </div>
              {row.exercise.equipment === 'barbell' && row.exercise.loadModel === 'total' && (
                <button type="button" className="min-h-tap min-w-tap text-sm text-muted" onClick={() => setPlates(row.we.id)}>
                  Plates
                </button>
              )}
              <button
                type="button"
                aria-label={`${row.exercise.name} options`}
                className="min-h-tap min-w-tap text-sm text-muted"
                onClick={() => setMenu(row.we.id)}
              >
                Options
              </button>
            </div>
            <div className="flex items-center gap-2 px-1 pb-1 text-xs uppercase text-muted">
              <span className="min-w-tap text-center">Set</span>
              <span className="w-20 shrink-0">Previous</span>
              {fields.map((f) => (
                <span key={f} className="flex-1 text-center">{f === 'weight' ? `${WEIGHT_HEADER[row.exercise.loadModel] ?? 'Weight'} (${unit})` : fieldLabel(f)}</span>
              ))}
              <span className="min-w-[48px]" />
            </div>
            <div className="flex flex-col gap-1">
              {fold && (
                <button type="button" onClick={() => setWarmOpen((o) => ({ ...o, [id]: true }))} className="num min-h-tap rounded-card bg-surface-2 px-3 text-left text-sm text-muted">
                  Warm-up · {warmIdx.length} {warmIdx.length === 1 ? 'set' : 'sets'} done ▸
                </button>
              )}
              {!fold && allWarmDone && (
                <button type="button" onClick={() => setWarmOpen((o) => ({ ...o, [id]: false }))} className="num min-h-tap rounded-card px-3 text-left text-sm text-muted">
                  Warm-up ▾
                </button>
              )}
              {row.sets.map((x, i) =>
                fold && x.type === 'warmup' ? null : (
                  <Fragment key={x.id}>
                  <SetRow
                    set={inUnit(x, unit)}
                    index={i}
                    ordinal={row.sets.slice(0, i).filter((s) => s.type !== 'warmup').length + 1}
                    fields={fields}
                    loadModel={row.exercise.loadModel}
                    previous={row.last[i] && inUnit(row.last[i]!, unit)}
                    editing={edit?.setId === x.id ? edit.field : undefined}
                    onEdit={(field) => setEdit({ setId: x.id, field })}
                    onOpenDetails={() => setDetails(x.id)}
                    pr={!!x.completedAt && prSetIds.includes(x.id)}
                    distUnit={distUnit}
                    {...(platesInline && isPlateLoaded(row) && x.weight ? { plates: plateLine(inUnit(x, unit).weight!, barFor(row, equipment, unit), platesFor(equipment, unit)) } : {})}
                    pairTotal={showPairTotal && row.exercise.loadModel === 'perImplement' ? displayWeight(x, row.exercise, true, unit) : undefined}
                    onToggle={() => {
                      setEdit(null);
                      void toggleComplete(x.id);
                    }}
                  />
                  {x.id === nextSetId(row, currentId) && fields.includes('weight') && (
                    <QuickStrip
                      last={lastDoneBefore(row, i)}
                      step={stepFor(row, 'weight')}
                      unit={unit}
                      onSame={(l) => void updateSet(x.id, { ...(l.weight !== undefined ? { weight: l.weight, unit: l.unit } : {}), ...(l.reps !== undefined ? { reps: l.reps } : {}) })}
                      onStep={(d) => {
                        const base = inUnit(x, unit).weight ?? (() => { const l = lastDoneBefore(row, i); return l ? inUnit(l, unit).weight : undefined; })();
                        if (base === undefined) return;
                        void updateSet(x.id, { weight: Math.max(0, Math.round((base + d) * 100) / 100), unit });
                      }}
                    />
                  )}
                  </Fragment>
                ),
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void addSet(row.we.id)} className="min-h-tap flex-1 rounded-card border border-line text-sm text-muted">
                + Add set
              </button>
              {row.exercise.equipment === 'barbell' && row.exercise.loadModel === 'total' && !row.sets.some((x) => x.type === 'warmup') && row.sets.some((x) => x.weight) && (
                <button type="button" onClick={() => void addWarmups(row.we.id, barFor(row, equipment, unit), platesFor(equipment, unit))} className="min-h-tap flex-1 rounded-card border border-line text-sm text-muted">
                  + Warm-ups
                </button>
              )}
            </div>
          </section>
        );
      })}

      <label htmlFor="session-notes" className="pb-1 pt-2 text-sm text-muted">Session notes</label>
      <textarea
        id="session-notes"
        className="min-h-[72px] w-full rounded-card border border-line bg-surface p-3 text-base text-fg placeholder:text-muted"
        placeholder="Sleep, energy, anything worth remembering"
        value={workout.notes ?? ''}
        onChange={(e) => void setWorkoutNotes(e.target.value)}
      />

      {/* Primary actions in the bottom third. */}
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <button type="button" onClick={onAddExercise} className="min-h-[56px] w-full rounded-card border border-line bg-surface text-base text-fg">
          Add exercise
        </button>
        {message && <p role="alert" className="text-sm text-muted">{message}</p>}
        <button
          type="button"
          onClick={() => void onFinish()}
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg"
        >
          {editing ? 'Save changes' : 'Finish workout'}
        </button>
        <button type="button" onClick={() => void onDiscard()} className="min-h-tap text-sm text-muted">
          {editing ? 'Close without finishing' : 'Discard workout'}
        </button>
      </div>

      {edit && editRow && editSet && (
        <Keypad
          key={`${edit.setId}:${edit.field}`}
          label={`${fieldLabel(edit.field)} · ${editRow.exercise.name}`}
          value={edit.field === 'distanceM' && editSet.distanceM !== undefined ? Math.round(metresTo(editSet.distanceM, distUnit) * 10) / 10 : inUnit(editSet, unit)[edit.field]}
          step={stepFor(editRow, edit.field)}
          allowDecimal={edit.field === 'weight'}
          onChange={(v) => void updateSet(edit.setId, edit.field === 'weight' ? { weight: v, unit } : edit.field === 'distanceM' ? { distanceM: v === undefined ? v : toMetres(v, distUnit) } : { [edit.field]: v })}
          nextLabel={nextField(fieldsFor(editRow.exercise.loadModel), edit.field) ? fieldLabel(nextField(fieldsFor(editRow.exercise.loadModel), edit.field)!) : 'Done'}
          onNext={() => {
            const n = nextField(fieldsFor(editRow.exercise.loadModel), edit.field);
            setEdit(n ? { setId: edit.setId, field: n } : null);
          }}
          onClose={() => setEdit(null)}
        />
      )}

      {menuRow && (
        <ExerciseSheet
          row={menuRow}
          index={menuIndex}
          count={rows.length}
          linkedToNext={!!menuRow.we.supersetGroup && rows[menuIndex + 1]?.we.supersetGroup === menuRow.we.supersetGroup}
          onSuperset={() => void toggleSuperset(menuRow.we.id)}
          onStickyNote={(n) => void setStickyNote(menuRow.exercise.id, n)}
          onSessionNote={(n) => void setExerciseNote(menuRow.we.id, n)}
          onReorder={() => {
            setMenu(null);
            setReordering(true);
          }}
          onSwap={() => {
            setMenu(null);
            onSwapExercise(menuRow.we.id);
          }}
          onRemove={() => {
            setConfirm('remove');
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {reordering && <ReorderSheet rows={rows} onReorder={(ids) => void setExerciseOrder(ids)} onClose={() => setReordering(false)} />}

      {plateRow && (
        <PlateSheet
          exerciseName={plateRow.exercise.name}
          unit={unit}
          initialTarget={plateTarget(plateRow, unit)}
          bar={barFor(plateRow, equipment, unit)}
          plates={platesFor(equipment, unit)}
          onClose={() => setPlates(null)}
        />
      )}

      {detailSet && detailRow && (
        <SetSheet
          set={detailSet}
          index={detailRow.sets.findIndex((s) => s.id === detailSet.id)}
          onPatch={(patch) => void updateSet(detailSet.id, patch)}
          onDelete={() => {
            setDetails(null);
            void removeSet(detailSet.id);
          }}
          onClose={() => setDetails(null)}
        />
      )}
      {confirm === 'discard' && (
        <ConfirmDialog
          title="Discard workout?"
          body="It will be moved to the trash."
          confirmLabel="Discard"
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            setEdit(null);
            void discard();
          }}
        />
      )}
      {confirm === 'remove' && menuRow && (
        <ConfirmDialog
          title={`Remove ${menuRow.exercise.name}?`}
          body="Its sets are removed from this workout."
          confirmLabel="Remove"
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            setMenu(null);
            void removeExercise(menuRow.we.id);
          }}
        />
      )}
    </div>
  );
}

function nextField(fields: SetField[], current: SetField): SetField | undefined {
  return fields[fields.indexOf(current) + 1];
}

/** Weight to preload in the plate calculator: first unfinished set, else the last set. */
function plateTarget(row: ExerciseRow, unit: 'lb' | 'kg'): number {
  const s = row.sets.find((x) => !x.completedAt && x.weight !== undefined) ?? [...row.sets].reverse().find((x) => x.weight !== undefined);
  return s?.weight === undefined ? 0 : Math.round(convertWeight(s.weight, s.unit, unit) * 100) / 100;
}

/** The set you are about to do: the first unfinished set of the current exercise. */
function nextSetId(row: ExerciseRow, currentId: ID | undefined): ID | undefined {
  return row.we.id === currentId ? row.sets.find((s) => !s.completedAt)?.id : undefined;
}

/** Last completed set before index `i`, same kind (warm-up or working) when there is one. */
function lastDoneBefore(row: ExerciseRow, i: number): SetEntry | undefined {
  const done = row.sets.slice(0, i).filter((s) => s.completedAt && (s.weight !== undefined || s.reps !== undefined));
  const warm = row.sets[i]?.type === 'warmup';
  return [...done].reverse().find((s) => (s.type === 'warmup') === warm) ?? done[done.length - 1];
}

/** One-tap adjustments for the next set only: copy the last set, or step the weight by the exercise increment. */
function QuickStrip({ last, step, unit, onSame, onStep }: { last?: SetEntry; step: number; unit: 'lb' | 'kg'; onSame: (l: SetEntry) => void; onStep: (d: number) => void }) {
  const btn = 'min-h-tap rounded-card border border-line px-3 text-sm text-muted';
  const shown = last ? inUnit(last, unit) : undefined;
  return (
    <div className="flex gap-2 pl-[52px] pr-[56px]">
      <button type="button" className={`${btn} num flex-1 truncate`} disabled={!last} onClick={() => last && onSame(last)} aria-label="Same as last set">
        {shown ? `Same · ${shown.weight ?? '—'}×${shown.reps ?? '—'}` : 'Same as last'}
      </button>
      <button type="button" className={`${btn} num`} onClick={() => onStep(-step)} aria-label={`Minus ${step} ${unit}`}>−{step}</button>
      <button type="button" className={`${btn} num`} onClick={() => onStep(step)} aria-label={`Plus ${step} ${unit}`}>+{step}</button>
    </div>
  );
}

const isPlateLoaded = (row: ExerciseRow) => row.exercise.equipment === 'barbell' && row.exercise.loadModel === 'total';

/** Bar weight for a barbell exercise in `unit`: the exercise's own bar, else the equipment profile's, else 45 lb. */
function barFor(row: ExerciseRow, equipment: EquipmentProfile | undefined, unit: 'lb' | 'kg'): number {
  const b = row.exercise.barWeight ?? equipment?.barWeight ?? { value: 45, unit: 'lb' as const };
  return convertWeight(b.value, b.unit, unit);
}

/** Plates per side in `unit`: the equipment profile's, else a standard lb set. */
function platesFor(equipment: EquipmentProfile | undefined, unit: 'lb' | 'kg'): number[] {
  const list = equipment?.plates ?? [45, 35, 25, 10, 5, 2.5].map((value) => ({ value, unit: 'lb' as const }));
  return list.map((p) => Math.round(convertWeight(p.value, p.unit, unit) * 100) / 100);
}
