import { useEffect, useState } from 'react';
import { Keypad } from '../../components/Keypad';
import { convertWeight } from '../../domain/units';
import { fieldsFor, type SetField } from '../../domain/logging';
import type { ID } from '../../domain/types';
import { SetRow } from './SetRow';
import { SetSheet } from './SetSheet';
import { useWorkout, type ExerciseRow } from './workoutStore';

interface Props {
  onAddExercise: () => void;
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
export function ActiveWorkout({ onAddExercise }: Props) {
  const { workout, rows, unit, updateSet, toggleComplete, addSet, removeSet, removeExercise, finish, discard } = useWorkout();
  const [edit, setEdit] = useState<{ setId: ID; field: SetField } | null>(null);
  const [details, setDetails] = useState<ID | null>(null);
  const [message, setMessage] = useState('');

  if (!workout) return null;

  const editRow = edit ? rows.find((r) => r.sets.some((s) => s.id === edit.setId)) : undefined;
  const editSet = editRow?.sets.find((s) => s.id === edit?.setId);
  const detailRow = details ? rows.find((r) => r.sets.some((s) => s.id === details)) : undefined;
  const detailSet = detailRow?.sets.find((s) => s.id === details);

  const stepFor = (row: ExerciseRow, field: SetField): number => {
    if (field === 'weight') return Math.round(convertWeight(row.exercise.weightIncrement, row.exercise.incrementUnit, editSet?.unit ?? unit) * 100) / 100;
    if (field === 'durationSec') return 5;
    if (field === 'distanceM') return 50;
    return 1;
  };

  const onFinish = async () => {
    setEdit(null);
    const ok = await finish();
    if (!ok) setMessage('Tick off at least one set to finish, or discard the workout.');
  };

  const onDiscard = async () => {
    if (window.confirm('Discard this workout? It will be moved to the trash.')) {
      setEdit(null);
      await discard();
    }
  };

  return (
    <div className="flex min-h-full flex-col pb-6" style={{ paddingBottom: edit ? 340 : undefined }}>
      <div className="flex items-baseline justify-between pb-3 pt-6">
        <h1 className="text-4xl uppercase">{workout.name}</h1>
        <Elapsed startedAt={workout.startedAt} />
      </div>

      {rows.length === 0 && <p className="py-4 text-sm text-muted">Add your first exercise to start logging.</p>}

      {rows.map((row) => {
        const fields = fieldsFor(row.exercise.loadModel);
        return (
          <section key={row.we.id} className="mb-4 rounded-card border border-line bg-surface p-3" aria-label={row.exercise.name}>
            <div className="flex items-start justify-between gap-2 pb-2">
              <div>
                <h2 className="text-2xl uppercase">{row.exercise.name}</h2>
                {row.exercise.stickyNote && <p className="text-sm text-muted">{row.exercise.stickyNote}</p>}
              </div>
              <button
                type="button"
                className="min-h-tap min-w-tap text-sm text-muted"
                onClick={() => window.confirm(`Remove ${row.exercise.name} from this workout?`) && void removeExercise(row.we.id)}
              >
                Remove
              </button>
            </div>
            <div className="flex items-center gap-2 px-1 pb-1 text-xs uppercase text-muted">
              <span className="min-w-tap text-center">Set</span>
              <span className="w-20 shrink-0">Previous</span>
              {fields.map((f) => (
                <span key={f} className="flex-1 text-center">{f === 'weight' ? `${WEIGHT_HEADER[row.exercise.loadModel] ?? 'Weight'} (${unit})` : FIELD_LABEL[f]}</span>
              ))}
              <span className="min-w-[48px]" />
            </div>
            <div className="flex flex-col gap-1">
              {row.sets.map((s, i) => (
                <SetRow
                  key={s.id}
                  set={s}
                  index={i}
                  fields={fields}
                  loadModel={row.exercise.loadModel}
                  previous={row.last[i]}
                  editing={edit?.setId === s.id ? edit.field : undefined}
                  onEdit={(field) => setEdit({ setId: s.id, field })}
                  onOpenDetails={() => setDetails(s.id)}
                  onToggle={() => {
                    setEdit(null);
                    void toggleComplete(s.id);
                  }}
                />
              ))}
            </div>
            <button type="button" onClick={() => void addSet(row.we.id)} className="mt-2 min-h-tap w-full rounded-card border border-line text-sm text-muted">
              + Add set
            </button>
          </section>
        );
      })}

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
          Finish workout
        </button>
        <button type="button" onClick={() => void onDiscard()} className="min-h-tap text-sm text-muted">
          Discard workout
        </button>
      </div>

      {edit && editRow && editSet && (
        <Keypad
          key={`${edit.setId}:${edit.field}`}
          label={`${FIELD_LABEL[edit.field]} · ${editRow.exercise.name}`}
          value={editSet[edit.field]}
          step={stepFor(editRow, edit.field)}
          allowDecimal={edit.field === 'weight'}
          onChange={(v) => void updateSet(edit.setId, { [edit.field]: v })}
          nextLabel={nextField(fieldsFor(editRow.exercise.loadModel), edit.field) ? FIELD_LABEL[nextField(fieldsFor(editRow.exercise.loadModel), edit.field)!] : 'Done'}
          onNext={() => {
            const n = nextField(fieldsFor(editRow.exercise.loadModel), edit.field);
            setEdit(n ? { setId: edit.setId, field: n } : null);
          }}
          onClose={() => setEdit(null)}
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
    </div>
  );
}

function nextField(fields: SetField[], current: SetField): SetField | undefined {
  return fields[fields.indexOf(current) + 1];
}
