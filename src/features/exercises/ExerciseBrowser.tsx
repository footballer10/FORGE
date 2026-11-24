import { useEffect, useMemo, useState } from 'react';
import { exerciseRepo } from '../../db/repositories';
import { ensureLibrary } from '../../db/seedLibrary';
import { searchExercises } from '../../domain/exerciseSearch';
import type { Equipment, Exercise, Muscle } from '../../domain/types';
import { EQUIPMENT_OPTIONS, MUSCLE_OPTIONS, labelFor } from './options';

interface Props {
  title: string;
  /** Called when a row is tapped: pick (picker) or edit (library). */
  onSelect: (exercise: Exercise) => void;
  onCreate: () => void;
  onBack: () => void;
}

const field =
  'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';

/** Search + filter list, recent first. Used as the library screen and as the exercise picker. */
export function ExerciseBrowser({ title, onSelect, onCreate, onBack }: Props) {
  const [all, setAll] = useState<Exercise[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | ''>('');
  const [equipment, setEquipment] = useState<Equipment | ''>('');

  useEffect(() => {
    let live = true;
    void ensureLibrary()
      .catch(() => undefined)
      .then(() => Promise.all([exerciseRepo.list(), exerciseRepo.recentIds()]))
      .then(([list, ids]) => {
      if (!live) return;
      setAll(list);
      setRecent(ids);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(
    () =>
      searchExercises(all, {
        query,
        recentIds: recent,
        ...(muscle ? { muscle } : {}),
        ...(equipment ? { equipment } : {}),
      }).slice(0, 200),
    [all, recent, query, muscle, equipment],
  );

  return (
    <div className="flex min-h-full flex-col pb-6">
      <div className="flex items-center justify-between pb-3 pt-6">
        <h1 className="text-4xl uppercase">{title}</h1>
        <button type="button" onClick={onBack} className="min-h-tap px-2 text-sm text-muted">
          Close
        </button>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or alias"
        aria-label="Search exercises"
        className={field}
      />
      <div className="grid grid-cols-2 gap-2 py-2">
        <select aria-label="Muscle" value={muscle} onChange={(e) => setMuscle(e.target.value as Muscle | '')} className={field}>
          <option value="">Any muscle</option>
          {MUSCLE_OPTIONS.map((m) => (
            <option key={m} value={m}>{labelFor(m)}</option>
          ))}
        </select>
        <select aria-label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment | '')} className={field}>
          <option value="">Any equipment</option>
          {EQUIPMENT_OPTIONS.map((q) => (
            <option key={q} value={q}>{labelFor(q)}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="py-6 text-sm text-muted">Loading library…</p>
      ) : results.length === 0 ? (
        <p className="py-6 text-sm text-muted">No exercises match. Create a custom one below.</p>
      ) : (
        <ul className="divide-y divide-line">
          {results.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onSelect(e)} className="flex min-h-tap w-full flex-col items-start justify-center py-2 text-left">
                <span className="text-base text-fg">{e.name}</span>
                <span className="text-xs text-muted">
                  {labelFor(e.equipment)} · {e.primaryMuscles.map(labelFor).join(', ') || '—'}
                  {recent.includes(e.id) ? ' · recent' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={onCreate}
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg"
        >
          New custom exercise
        </button>
      </div>
    </div>
  );
}
