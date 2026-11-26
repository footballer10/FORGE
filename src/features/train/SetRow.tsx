import { SET_TYPES, formatDuration, formatSet, type SetField } from '../../domain/logging';
import type { LoadModel, SetEntry } from '../../domain/types';
import { metresTo, type DistanceUnit } from '../../domain/units';

interface Props {
  set: SetEntry;
  index: number;
  /** 1-based number among working sets (warm-ups show W and are not counted), like Strong. */
  ordinal?: number;
  fields: SetField[];
  loadModel: LoadModel;
  previous?: SetEntry;
  editing?: SetField;
  onEdit: (field: SetField) => void;
  onOpenDetails: () => void;
  onToggle: () => void;
  /** Pair total to show under the weight (display only), when enabled for dumbbells. */
  pairTotal?: number;
  /** Rep PR just set: short highlight. */
  pr?: boolean;
  /** Distance display unit (stored in metres). */
  distUnit?: DistanceUnit;
  /** Per-side plates under a barbell weight, e.g. "45×2 10". */
  plates?: string;
}

function display(set: SetEntry, field: SetField, dist: DistanceUnit = 'm'): string {
  const v = set[field];
  if (v === undefined) return '—';
  if (field === 'distanceM') return String(Math.round(metresTo(v, dist) * 10) / 10);
  return field === 'durationSec' ? formatDuration(v) : String(Math.round(v * 100) / 100);
}

export function SetRow({ set, index, ordinal, fields, loadModel, previous, editing, onEdit, onOpenDetails, onToggle, pairTotal, pr, distUnit = 'm', plates }: Props) {
  const done = !!set.completedAt;
  const badge = SET_TYPES.find((t) => t.type === set.type)?.short || String(ordinal ?? index + 1);
  return (
    <div className={`flex items-center gap-2 rounded-card px-1 py-1 ${done ? 'bg-surface-2' : ''} ${pr ? 'animate-pr ring-1 ring-accent' : ''}`}>
      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={`Set ${index + 1} details${set.rpe ? `, RPE ${set.rpe}` : ''}${set.rir !== undefined ? `, ${set.rir} reps in reserve` : ''}`}
        className="num min-h-tap min-w-tap rounded-card text-xl text-muted"
      >
        {pr ? <span className="text-sm font-bold text-accent-text">PR</span> : badge}
        {(set.rpe !== undefined || set.rir !== undefined) && <span className="text-xs text-accent-text">•</span>}
      </button>
      <span className="num w-20 shrink-0 truncate text-sm text-muted" aria-label="Previous session">
        {previous ? formatSet(previous, loadModel, previous.unit, distUnit) : '—'}
      </span>
      {fields.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onEdit(f)}
          aria-label={`${f} ${display(set, f, distUnit)}`}
          className={`num relative min-h-tap flex-1 rounded-card border text-2xl ${editing === f ? 'border-accent' : 'border-line'} ${done ? 'text-muted' : 'text-fg'}`}
        >
          {display(set, f, distUnit)}
          {/* Pinned to the bottom edge so the row keeps its height. */}
          {f === 'weight' && plates && <span className="pointer-events-none absolute inset-x-0 bottom-0.5 truncate px-1 font-sans text-[10px] leading-none text-muted" aria-hidden>{plates}</span>}
          {f === 'weight' && pairTotal !== undefined && <span className="block text-xs text-muted">{Math.round(pairTotal * 100) / 100} total</span>}
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
