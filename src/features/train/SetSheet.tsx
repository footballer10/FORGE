import { SET_TYPES } from '../../domain/logging';
import type { SetEntry, SetType } from '../../domain/types';

interface Props {
  set: SetEntry;
  index: number;
  onPatch: (patch: Partial<SetEntry>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const RPE = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const RIR = [0, 1, 2, 3, 4];

function chip(active: boolean) {
  return `num min-h-tap min-w-tap rounded-card border px-3 text-lg ${active ? 'border-accent text-fg' : 'border-line text-muted'}`;
}

/** Set type, optional RPE / RIR, delete. Tapping an active chip clears it. */
export function SetSheet({ set, index, onPatch, onDelete, onClose }: Props) {
  return (
    <div role="dialog" aria-label={`Set ${index + 1} details`} className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="pb-safe rounded-t-card border-t border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="pb-3 text-2xl uppercase">Set {index + 1}</h2>
        <p className="pb-1 text-sm text-muted">Type</p>
        <div className="flex flex-wrap gap-2 pb-4">
          {SET_TYPES.map((t) => (
            <button key={t.type} type="button" aria-pressed={set.type === t.type} className={chip(set.type === t.type).replace('num ', '')} onClick={() => onPatch({ type: t.type as SetType })}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="pb-1 text-sm text-muted">RPE (optional)</p>
        <div className="flex flex-wrap gap-2 pb-4">
          {RPE.map((v) => (
            <button key={v} type="button" aria-pressed={set.rpe === v} className={chip(set.rpe === v)} onClick={() => onPatch({ rpe: set.rpe === v ? undefined : v })}>{v}</button>
          ))}
        </div>
        <p className="pb-1 text-sm text-muted">Reps in reserve (optional)</p>
        <div className="flex flex-wrap gap-2 pb-4">
          {RIR.map((v) => (
            <button key={v} type="button" aria-pressed={set.rir === v} className={chip(set.rir === v)} onClick={() => onPatch({ rir: set.rir === v ? undefined : v })}>{v}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onDelete} className="min-h-[56px] flex-1 rounded-card border border-line text-base text-muted">Delete set</button>
          <button type="button" onClick={onClose} className="num min-h-[56px] flex-1 rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">Done</button>
        </div>
      </div>
    </div>
  );
}
