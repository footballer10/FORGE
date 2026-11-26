import { useEffect, useState } from 'react';
import { analyticsRepo, type StrengthLift } from '../../db/repositories';
import type { ID, Profile } from '../../domain/types';

/** Which lifts count toward the overall strength line on the Strength tab. Absent setting = all of them. */
export function OverallLiftsSection({ profile, onSave }: { profile: Profile; onSave: (ids: ID[] | undefined) => void }) {
  const [lifts, setLifts] = useState<StrengthLift[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void analyticsRepo.strengthLifts().then(setLifts);
  }, []);
  if (!lifts) return null;
  const chosen = new Set(profile.overallLifts ?? lifts.map((l) => l.exercise.id));
  const all = profile.overallLifts === undefined;
  const toggle = (id: ID) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSave([...next]);
  };
  return (
    <section className="rounded-card border border-line bg-surface px-4 py-3" aria-label="Overall strength">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-tap w-full items-center justify-between text-left">
        <span>Lifts in overall strength</span>
        <span className="text-sm text-muted">{all ? 'All' : `${chosen.size} of ${lifts.length}`} ›</span>
      </button>
      {open && (
        <div className="pb-2">
          <p className="pb-2 text-xs text-muted">The overall line on the Strength tab averages how much each chosen lift has improved since you started it.</p>
          <div className="flex gap-2 pb-2">
            <button type="button" onClick={() => onSave(undefined)} className="min-h-tap rounded-card border border-line px-3 text-sm">All lifts</button>
            <button type="button" onClick={() => onSave([])} className="min-h-tap rounded-card border border-line px-3 text-sm">None</button>
          </div>
          {lifts.length === 0 && <p className="text-sm text-muted">No lifts with weights logged yet.</p>}
          <ul className="divide-y divide-line">
            {lifts.map((l) => (
              <li key={l.exercise.id}>
                <label className="flex min-h-tap items-center justify-between gap-3 py-1">
                  <span className="text-sm">{l.exercise.name}</span>
                  <input type="checkbox" className="h-6 w-6" checked={chosen.has(l.exercise.id)} onChange={() => toggle(l.exercise.id)} />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
