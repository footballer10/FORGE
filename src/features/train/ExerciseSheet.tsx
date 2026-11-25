import type { ExerciseRow } from './workoutStore';

interface Props {
  row: ExerciseRow;
  index: number;
  count: number;
  /** True when this exercise and the next share a superset group. */
  linkedToNext: boolean;
  onStickyNote: (note: string) => void;
  onSessionNote: (note: string) => void;
  onReorder: () => void;
  onSwap: () => void;
  onSuperset: () => void;
  onRemove: () => void;
  onClose: () => void;
}

const area = 'min-h-[88px] w-full rounded-card border border-line bg-surface-2 p-3 text-base text-fg placeholder:text-muted';
const btn = 'min-h-[56px] flex-1 rounded-card border border-line text-base disabled:opacity-40';

/** Per-exercise actions: notes (sticky + this session), move, swap, remove. */
export function ExerciseSheet({ row, index, count, linkedToNext, onStickyNote, onSessionNote, onReorder, onSwap, onSuperset, onRemove, onClose }: Props) {
  const swapBlocked = row.sets.some((s) => s.completedAt);
  return (
    <div role="dialog" aria-label={`${row.exercise.name} options`} className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="pb-safe max-h-[85%] overflow-y-auto rounded-t-card border-t border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="pb-3 text-2xl uppercase">{row.exercise.name}</h2>

        <label className="block pb-1 text-sm text-muted" htmlFor="sticky-note">Sticky note (shown every time you log this exercise)</label>
        <textarea id="sticky-note" className={area} placeholder="Seat height, grip, cues" value={row.exercise.stickyNote ?? ''} onChange={(e) => onStickyNote(e.target.value)} />

        <label className="mt-3 block pb-1 text-sm text-muted" htmlFor="session-note">Note for this workout only</label>
        <textarea id="session-note" className={area} placeholder="How it felt, pain, changes" value={row.we.notes ?? ''} onChange={(e) => onSessionNote(e.target.value)} />

        <div className="flex gap-2 pt-4">
          <button type="button" className={btn} disabled={count < 2} onClick={onReorder}>Reorder exercises</button>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className={btn} disabled={index === count - 1} onClick={onSuperset}>
            {linkedToNext ? 'Unlink superset' : 'Superset with next'}
          </button>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" className={btn} disabled={swapBlocked} onClick={onSwap}>Swap exercise</button>
          <button type="button" className={`${btn} text-muted`} onClick={onRemove}>Remove</button>
        </div>
        {swapBlocked && <p className="pt-1 text-xs text-muted">Swap is only available before any set is completed.</p>}
        <button type="button" onClick={onClose} className="num mt-3 min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">Done</button>
      </div>
    </div>
  );
}
