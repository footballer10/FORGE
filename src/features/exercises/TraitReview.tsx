import { useEffect, useState } from 'react';
import { exerciseRepo } from '../../db/repositories';
import type { InferredTraits } from '../../domain/exerciseInference';
import type { Exercise } from '../../domain/types';
import { SubScreen } from '../../components/SubScreen';
import { labelFor } from './options';

type Row = { exercise: Exercise; traits?: InferredTraits };

/** Bulk review: exercises with no muscles get a suggested fill; the user ticks what to apply. */
export function TraitReview({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<number | null>(null);

  async function load() {
    const list = await exerciseRepo.traitSuggestions();
    setRows(list);
    setPicked(new Set(list.filter((r) => r.traits).map((r) => r.exercise.id)));
  }
  useEffect(() => {
    void load();
  }, []);

  async function apply() {
    const entries = (rows ?? []).flatMap((r) => (r.traits && picked.has(r.exercise.id) ? [{ id: r.exercise.id, ...r.traits }] : []));
    setDone(await exerciseRepo.applyTraits(entries));
    await load();
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const applicable = (rows ?? []).filter((r) => r.traits);
  const chosen = applicable.filter((r) => picked.has(r.exercise.id)).length;

  return (
    <SubScreen title="Review exercises" onBack={onBack}>
      <p className="pb-3 text-sm text-muted">
        These exercises have no muscles set, so their sets do not count toward weekly muscle volume or balance checks. The fill comes from the closest library exercise, else from words in the name. Untick any that look wrong; change single ones in the exercise library.
      </p>
      {done !== null && <p role="status" className="pb-3 text-sm">Updated {done} exercise{done === 1 ? '' : 's'}.</p>}
      {rows && rows.length === 0 && <p className="text-muted">Every exercise has muscles set.</p>}
      <ul className="flex flex-col gap-2">
        {(rows ?? []).map(({ exercise, traits }) => (
          <li key={exercise.id} className="rounded-card border border-line bg-surface px-4 py-3">
            {traits ? (
              <label className="flex min-h-tap items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={picked.has(exercise.id)} onChange={() => toggle(exercise.id)} />
                <span>
                  <span className="block font-medium">{exercise.name}</span>
                  <span className="block text-sm">
                    {[...traits.primaryMuscles, ...traits.secondaryMuscles.map((m) => `${m} (secondary)`)].map(labelFor).join(', ')} · {traits.pattern}
                  </span>
                  <span className="block text-xs text-muted">{traits.reason}</span>
                </span>
              </label>
            ) : (
              <div className="min-h-tap py-1">
                <span className="block font-medium">{exercise.name}</span>
                <span className="block text-xs text-muted">No suggestion. Set the muscles in the exercise library.</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {applicable.length > 0 && (
        <button type="button" onClick={() => void apply()} disabled={chosen === 0} className="mt-4 min-h-tap w-full rounded-card bg-accent px-4 font-medium text-white disabled:opacity-40">
          Apply to {chosen} exercise{chosen === 1 ? '' : 's'}
        </button>
      )}
    </SubScreen>
  );
}
