import { useEffect, useState } from 'react';
import { insightsRepo } from '../../db/repositories';
import type { Insight } from '../../domain/insights';

/** Up to three plain-language notes under the status line. Tap a note for the rule and numbers; dismiss with ×. */
export function InsightNotes() {
  const [notes, setNotes] = useState<Insight[]>([]);
  const [open, setOpen] = useState<string>();

  useEffect(() => {
    let live = true;
    void insightsRepo.current().then((n) => live && setNotes(n)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-2 pb-3" aria-label="Notes">
      {notes.map((n) => (
        <li key={n.id} className="flex items-start rounded-card border border-line bg-surface">
          <button type="button" aria-expanded={open === n.id} onClick={() => setOpen(open === n.id ? undefined : n.id)} className="min-h-tap flex-1 px-3 py-2 text-left text-sm">
            <span className="text-fg">{n.text}</span>
            {open === n.id && <span className="mt-1 block text-muted">{n.detail}</span>}
          </button>
          <button
            type="button"
            aria-label="Dismiss note"
            onClick={() => {
              insightsRepo.dismiss(n.id);
              setNotes((cur) => cur.filter((x) => x.id !== n.id));
            }}
            className="min-h-tap min-w-tap text-lg text-muted"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
