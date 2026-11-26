import { useEffect, useState } from 'react';
import { UNDO_EVENT, backupRepo, metaRepo, nowIso, undoRepo } from '../../db/repositories';
import { useWorkout } from '../train/workoutStore';
import { TrashScreen } from './TrashScreen';
import { StrongExportScreen } from './StrongExportScreen';
import { parseExport, type ExportFile, type TableMergePlan } from '../../domain/backup';

const button = 'min-h-tap w-full rounded-card border border-line bg-surface px-4 text-left text-base text-fg';

/** Hand a text file to the user: share sheet when it can take files (iPhone), else a download. */
async function deliver(name: string, text: string, type: string): Promise<void> {
  const file = new File([text], name, { type });
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

const stampName = () => new Date().toISOString().slice(0, 10);

export function DataScreen({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState('');
  const [restore, setRestore] = useState<{ file: ExportFile; plan: TableMergePlan[]; name: string } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trash, setTrash] = useState(false);
  const [strongExport, setStrongExport] = useState(false);
  const [undoLabel, setUndoLabel] = useState<string>();
  useEffect(() => {
    const load = () => void undoRepo.latest().then((e) => setUndoLabel(e?.label));
    load();
    window.addEventListener(UNDO_EVENT, load);
    return () => window.removeEventListener(UNDO_EVENT, load);
  }, []);
  if (trash) return <TrashScreen onBack={() => setTrash(false)} />;
  if (strongExport) return <StrongExportScreen onBack={() => setStrongExport(false)} />;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setStatus('');
    try {
      setStatus(await fn());
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () =>
    run(async () => {
      const file = await backupRepo.exportAll();
      await deliver(`forge-backup-${stampName()}.json`, JSON.stringify(file), 'application/json');
      await metaRepo.set('lastBackupAt', nowIso());
      return `Backup saved: ${file.counts.workouts ?? 0} workouts, ${file.counts.sets ?? 0} sets.`;
    });

  const pickRestore = (f: File) =>
    run(async () => {
      const parsed = parseExport(await f.text());
      if ('error' in parsed) return parsed.error;
      setConfirmReplace(false);
      setRestore({ file: parsed.file, plan: await backupRepo.previewMerge(parsed.file), name: f.name });
      return '';
    });

  const apply = (mode: 'merge' | 'replace') =>
    run(async () => {
      if (!restore) return '';
      if (mode === 'merge') await backupRepo.restoreMerge(restore.file);
      else await backupRepo.restoreReplace(restore.file);
      setRestore(null);
      setConfirmReplace(false);
      return mode === 'merge' ? 'Merged. Newer rows from the backup were applied; nothing local was removed.' : 'Restored. Everything now matches the backup.';
    });

  const sum = (k: 'add' | 'update') => restore?.plan.reduce((n, p) => n + p[k].length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center justify-between pb-1 pt-6">
        <h1 className="text-4xl uppercase">Backup</h1>
        <button type="button" onClick={onBack} className="min-h-tap px-2 text-sm text-muted">Close</button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl uppercase">Undo &amp; trash</h2>
        <button
          type="button"
          disabled={!undoLabel || busy}
          onClick={() => void run(async () => `Undone: ${(await undoRepo.undoLatest()) ?? 'nothing'}`).then(() => useWorkout.getState().load())}
          className={`${button} disabled:opacity-40`}
        >
          {undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}
        </button>
        <button type="button" onClick={() => setTrash(true)} className={button}>Trash</button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl uppercase">Export</h2>
        <button type="button" disabled={busy} onClick={() => void exportJson()} className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg disabled:opacity-40">
          Save full backup (JSON)
        </button>
        <p className="text-sm text-muted">Everything except progress photos. Save it to Files or iCloud Drive from the share sheet.</p>
        <button type="button" disabled={busy} onClick={() => setStrongExport(true)} className={button}>Export workouts as CSV (Strong format)…</button>
        <p className="text-sm text-muted">For Hevy, other trackers and spreadsheets. Strong itself cannot import files.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl uppercase">Restore</h2>
        <label className={`${button} flex cursor-pointer items-center`}>
          Choose a Forge backup…
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void pickRestore(f);
            }}
          />
        </label>
      </section>

      {restore && (
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h2 className="text-2xl uppercase">{restore.name}</h2>
          <p className="text-sm text-muted">Exported {restore.file.exportedAt ? new Date(restore.file.exportedAt).toLocaleString() : 'at an unknown time'}</p>
          <ul className="num text-sm text-fg">
            {restore.plan.map((p) => (
              <li key={p.table}>
                {p.table}: {p.add.length + p.update.length + p.keep} in backup · {p.add.length} new · {p.update.length} newer · {p.keep} unchanged
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={() => void apply('merge')} className="num min-h-[56px] w-full rounded-card bg-accent text-lg font-semibold uppercase tracking-wider text-accent-fg disabled:opacity-40">
            Merge ({sum('add')} new, {sum('update')} updated)
          </button>
          <p className="text-sm text-muted">Merge keeps everything on this phone and adds or updates rows from the backup (the later edit wins).</p>
          {confirmReplace ? (
            <button type="button" disabled={busy} onClick={() => void apply('replace')} className="min-h-tap w-full rounded-card border border-line text-base text-fg">
              Tap again: erase this phone's data and restore
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmReplace(true)} className="min-h-tap w-full rounded-card border border-line text-base text-fg">Replace everything…</button>
          )}
          <button type="button" onClick={() => setRestore(null)} className="min-h-tap text-sm text-muted">Cancel</button>
        </section>
      )}

      {status && <p role="status" className="text-sm text-fg">{status}</p>}
    </div>
  );
}
