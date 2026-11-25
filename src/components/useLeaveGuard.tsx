import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Unsaved-draft protection for editors. `snapshot` is any JSON-serialisable view of the draft; the draft is
 * "dirty" once it differs from its first value. `requestLeave` leaves at once when clean, else asks first.
 * Also warns before a page reload or close while dirty.
 */
export function useLeaveGuard(snapshot: unknown, leave: () => void): { dirty: boolean; requestLeave: () => void; dialog: ReactNode } {
  const initial = useRef<string>();
  const now = JSON.stringify(snapshot);
  if (initial.current === undefined) initial.current = now;
  const dirty = now !== initial.current;
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const dialog = asking ? (
    <ConfirmDialog
      title="Discard changes?"
      body="You have edits that are not saved. Leaving now loses them."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      destructive
      onConfirm={() => {
        setAsking(false);
        leave();
      }}
      onCancel={() => setAsking(false)}
    />
  ) : null;

  return { dirty, requestLeave: () => (dirty ? setAsking(true) : leave()), dialog };
}
