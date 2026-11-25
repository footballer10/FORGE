import { useEffect, useMemo, useState } from 'react';
import { SubScreen } from '../../components/SubScreen';
import { backupRepo, profileRepo, type StrongExportItem } from '../../db/repositories';
import type { StrongName } from '../../domain/strongNames';
import type { WeightUnit } from '../../domain/types';

const field = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg';
const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: '2-digit' });

/** Hand a text file to the user: share sheet when it can take files (iPhone), else a download. */
async function deliver(name: string, text: string): Promise<void> {
  const file = new File([text], name, { type: 'text/csv' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const SOURCE_NOTE: Record<StrongName['source'], string> = {
  set: 'Name you set',
  import: 'From your Strong import',
  hint: 'Matches your Strong template',
  guess: 'Check this name',
};

/**
 * Pick the workouts to send back to Strong. The file is Strong's own CSV format with Strong's exercise
 * names, warm-ups marked W and dumbbells as pair totals, so after importing it looks like the workout was
 * logged in Strong. Workouts that came FROM Strong are left out by default so they are not duplicated there.
 */
export function StrongExportScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<StrongExportItem[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [names, setNames] = useState<{ exerciseId: string; forgeName: string; strong: StrongName }[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void backupRepo.strongExportList().then((list) => {
      setItems(list);
      setPicked(new Set(list.filter((w) => !w.fromStrong).map((w) => w.id)));
    });
    void profileRepo.get().then((p) => setUnit(p.weightUnit));
  }, []);

  const pickedIds = useMemo(() => [...picked].sort(), [picked]);
  useEffect(() => {
    let live = true;
    void backupRepo.strongNameCheck(pickedIds).then((n) => live && setNames(n));
    return () => {
      live = false;
    };
  }, [pickedIds]);

  if (!items) return null;
  const visible = showAll ? items : items.filter((w) => !w.fromStrong);
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const unsure = names.filter((n) => n.strong.source === 'guess' && !(edits[n.exerciseId]?.trim()));

  async function run() {
    setBusy(true);
    setStatus('');
    try {
      const changed = Object.fromEntries(Object.entries(edits).filter(([id, v]) => v.trim() !== (names.find((n) => n.exerciseId === id)?.strong.name ?? '')));
      if (Object.keys(changed).length) await backupRepo.setStrongNames(changed);
      const csv = await backupRepo.strongCsv(unit, pickedIds);
      await deliver(`forge-to-strong-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      setStatus(`Exported ${pickedIds.length} ${pickedIds.length === 1 ? 'workout' : 'workouts'} (${Math.max(0, csv.split('\n').length - 1)} sets, weights in ${unit}).`);
      setEdits({});
      setNames(await backupRepo.strongNameCheck(pickedIds));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SubScreen title="Export to Strong" onBack={onBack} backLabel="Backup">
      <p className="pb-3 text-sm text-muted">
        Choose the workouts to send. The file uses Strong's format and exercise names, marks warm-ups, and writes dumbbells as pair totals, so
        once it is imported the workouts look like you logged them in Strong. Your Forge data stays here too.
      </p>

      <div className="flex items-center justify-between pb-2">
        <label className="flex min-h-tap items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Also show workouts that came from Strong
        </label>
      </div>
      <div className="flex gap-2 pb-2">
        <button type="button" className="min-h-tap rounded-card border border-line px-3 text-sm" onClick={() => setPicked(new Set(visible.map((w) => w.id)))}>Select all</button>
        <button type="button" className="min-h-tap rounded-card border border-line px-3 text-sm" onClick={() => setPicked(new Set())}>Clear</button>
        <select aria-label="Weight unit" value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)} className={`${field} ml-auto`}>
          <option value="lb">Weights in lb</option>
          <option value="kg">Weights in kg</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="py-4 text-sm text-muted">No workouts logged in Forge yet. Turn on the box above to list the ones imported from Strong.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface" aria-label="Workouts to export">
          {visible.map((w) => (
            <li key={w.id}>
              <label className="flex min-h-[56px] items-center gap-3 px-3 py-2">
                <input type="checkbox" className="h-6 w-6 shrink-0" checked={picked.has(w.id)} onChange={() => toggle(w.id)} aria-label={`${w.name}, ${day.format(new Date(w.startedAt))}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base">{w.name}</span>
                  <span className="num block text-sm text-muted">{day.format(new Date(w.startedAt))} · {w.sets} sets{w.fromStrong ? ' · from Strong' : ''}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {names.length > 0 && (
        <details className="mt-4 rounded-card border border-line bg-surface p-3" open={unsure.length > 0}>
          <summary className="min-h-tap cursor-pointer py-2 text-base">
            Exercise names in Strong ({names.length}){unsure.length > 0 && <span className="ml-2 text-sm text-accent-text">{unsure.length} to check</span>}
          </summary>
          <p className="pb-2 text-sm text-muted">Strong matches exercises by exact name. Names marked "check" are guesses: type the name exactly as it appears in Strong, or Strong will add a new exercise.</p>
          <ul className="flex flex-col gap-3">
            {names.map((n) => (
              <li key={n.exerciseId}>
                <label className="block text-sm text-muted">
                  {n.forgeName} <span className={n.strong.source === 'guess' ? 'text-accent-text' : ''}>· {SOURCE_NOTE[n.strong.source]}</span>
                  <input
                    className={`${field} mt-1 w-full`}
                    aria-label={`Strong name for ${n.forgeName}`}
                    value={edits[n.exerciseId] ?? n.strong.name}
                    onChange={(e) => setEdits((cur) => ({ ...cur, [n.exerciseId]: e.target.value }))}
                  />
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

      {status && <p role="status" className="mt-3 text-sm text-muted">{status}</p>}
      <div className="sticky bottom-0 mt-4 bg-bg pt-2">
        <button
          type="button"
          disabled={busy || pickedIds.length === 0}
          onClick={() => void run()}
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg disabled:opacity-50"
        >
          Export {pickedIds.length} {pickedIds.length === 1 ? 'workout' : 'workouts'}
        </button>
      </div>
    </SubScreen>
  );
}
