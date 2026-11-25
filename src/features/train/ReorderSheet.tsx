import { SortableList } from '../../components/SortableList';
import type { ExerciseRow } from './workoutStore';

/** Compact list of this workout's exercises to drag into a new order (the cards themselves are too tall to drag). */
export function ReorderSheet({ rows, onReorder, onClose }: { rows: ExerciseRow[]; onReorder: (ids: string[]) => void; onClose: () => void }) {
  const ids = rows.map((r) => r.we.id);
  return (
    <div role="dialog" aria-label="Reorder exercises" className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="pb-safe max-h-[85%] overflow-y-auto rounded-t-card border-t border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="pb-1 text-2xl uppercase">Reorder</h2>
        <p className="pb-3 text-sm text-muted">Hold the handle and drag.</p>
        <div className="flex flex-col gap-2">
          <SortableList
            ids={ids}
            onMove={(from, to) => {
              const next = [...ids];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved as string);
              onReorder(next);
            }}
          >
            {(i, handle) => (
              <div className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface-2 px-3">
                <span className="min-w-0 truncate py-2 text-base">
                  {rows[i]?.we.supersetGroup && <span className="num mr-2 text-sm text-muted">SS {rows[i]?.we.supersetGroup}</span>}
                  {rows[i]?.exercise.name}
                </span>
                {handle}
              </div>
            )}
          </SortableList>
        </div>
        <button type="button" onClick={onClose} className="num mt-4 min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">Done</button>
      </div>
    </div>
  );
}
