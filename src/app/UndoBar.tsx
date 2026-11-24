import { useCallback, useEffect, useState } from 'react';
import { UNDO_EVENT, undoRepo } from '../db/repositories';
import { UNDO_BAR_SECONDS, isUndoFresh } from '../domain/safety';
import type { UndoEntry } from '../domain/types';
import { useWorkout } from '../features/train/workoutStore';

/** Snackbar for the most recent undoable action; hides after 20 s (the Backup screen can still undo it). */
export function UndoBar() {
  const [entry, setEntry] = useState<UndoEntry>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const latest = await undoRepo.latest();
    setEntry(latest && isUndoFresh(latest.createdAt, new Date()) ? latest : undefined);
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(UNDO_EVENT, refresh);
    return () => window.removeEventListener(UNDO_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!entry) return;
    const left = UNDO_BAR_SECONDS * 1000 - (Date.now() - Date.parse(entry.createdAt));
    const t = setTimeout(() => setEntry(undefined), Math.max(left, 0));
    return () => clearTimeout(t);
  }, [entry]);

  if (!entry) return null;
  return (
    <div role="status" className="mx-3 mb-2 flex items-center justify-between rounded-card border border-line bg-surface-2 px-4">
      <span className="text-sm text-fg">{entry.label}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void undoRepo
            .undoLatest()
            .then(() => useWorkout.getState().load())
            .finally(() => setBusy(false));
        }}
        className="min-h-tap px-2 text-base font-semibold uppercase text-fg"
      >
        Undo
      </button>
    </div>
  );
}
