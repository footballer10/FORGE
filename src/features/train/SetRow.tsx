import { SET_TYPES, formatDuration, formatSet, type SetField } from '../../domain/logging';
import type { LoadModel, SetEntry } from '../../domain/types';

interface Props {
  set: SetEntry;
  index: number;
  fields: SetField[];
  loadModel: LoadModel;
  previous?: SetEntry;
  editing?: SetField;
  onEdit: (field: SetField) => void;
  onOpenDetails: () => void;
  onToggle: () => void;
}

function display(set: SetEntry, field: SetField): string {
  const v = set[field];
  if (v === undefined) return '—';
  return field === 'durationSec' ? formatDuration(v) : String(Math.round(v * 100) / 100);
}

export function SetRow({ set, index, fields, loadModel, previous, editing, onEdit, onOpenDetails, onToggle }: Props) {
  const done = !!set.completedAt;
  const badge = SET_TYPES.find((t) => t.type === set.type)?.short || String(index + 1);
  return (
    <div className={`flex items-center gap-2 rounded-card px-1 py-1 ${done ? 'bg-surface-2' : ''}`}>
      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={`Set ${index + 1} details${set.rpe ? `, RPE ${set.rpe}` : ''}${set.rir !== undefined ? `, ${set.rir} reps in reserve` : ''}`}
        className="num min-h-tap min-w-tap rounded-card text-xl text-muted"
      >
        {badge}
        {(set.rpe !== undefined || set.rir !== undefined) && <span className="text-xs text-accent">•</span>}
      </button>
      <span className="num w-20 shrink-0 truncate text-sm text-muted" aria-label="Previous session">
        {previous ? formatSet(previous, loadModel, previous.unit) : '—'}
      </span>
      {fields.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onEdit(f)}
          aria-label={`${f} ${display(set, f)}`}
          className={`num min-h-tap flex-1 rounded-card border text-2xl ${editing === f ? 'border-accent' : 'border-line'} ${done ? 'text-muted' : 'text-fg'}`}
        >
          {display(set, f)}
        </button>
      ))}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? 'Mark set not done' : 'Complete set'}
        className={`min-h-[48px] min-w-[48px] rounded-card text-2xl ${done ? 'bg-accent text-accent-fg' : 'border border-line text-muted'}`}
      >
        ✓
      </button>
    </div>
  );
}
