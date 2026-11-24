import { useEffect, useMemo, useRef, useState } from 'react';
import { photoRepo } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { POSES, daysBetween, poseLabel, type Pose } from '../../domain/photos';
import type { ProgressPhoto } from '../../domain/types';
import { prepareImage } from './imageResize';

const field = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg';
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const SHOWN = 12;

type Mode = { kind: 'grid' } | { kind: 'view'; id: string } | { kind: 'compare'; ids: string[] };

/** Progress photos kept on this device only (not in backups). */
export function PhotosPanel() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);
  const [pose, setPose] = useState<Pose>('front');
  const [date, setDate] = useState(localDateKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'grid' });
  const [picking, setPicking] = useState<string[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [all, setAll] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void photoRepo.list().then((p) => live && setPhotos(p));
    return () => {
      live = false;
    };
  }, [tick]);
  useEffect(() => {
    const map = new Map(photos.map((p) => [p.id, URL.createObjectURL(p.blob)]));
    setUrls(map);
    return () => map.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue;
        await photoRepo.add(await prepareImage(f), date, pose);
      }
      // Ask the browser not to evict the photos under storage pressure (they exist nowhere else).
      void navigator.storage?.persist?.().catch(() => undefined);
      setTick((t) => t + 1);
    } catch {
      setError('Could not save the photo. The device may be out of storage.');
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = '';
      if (library.current) library.current.value = '';
    }
  }

  async function remove(id: string) {
    await photoRepo.remove(id);
    setMode({ kind: 'grid' });
    setConfirmDelete(false);
    setTick((t) => t + 1);
  }

  const img = (id: string, className: string) => {
    const u = urls.get(id);
    return u ? <img src={u} alt={`${poseLabel(byId.get(id)?.pose)} photo, ${byId.get(id)?.date ?? ''}`} loading="lazy" className={className} /> : null;
  };

  const shown = all ? photos : photos.slice(0, SHOWN);

  return (
    <section className="mx-4 mt-4 rounded-card border border-line bg-surface p-4" aria-label="Progress photos">
      <h2 className="font-display text-xl">Progress photos</h2>
      <p className="text-xs text-muted">Stored only on this device. They are not included in backups, so keep your own copies.</p>

      <div role="radiogroup" aria-label="Pose" className="mt-2 flex flex-wrap gap-2">
        {POSES.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={pose === p.id} onClick={() => setPose(p.id)} className={`min-h-tap rounded-full border px-4 text-sm ${pose === p.id ? 'border-fg bg-surface-2 text-fg' : 'border-line text-muted'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="date" aria-label="Photo date" className={`${field} w-40`} value={date} max={localDateKey(new Date())} onChange={(e) => setDate(e.target.value)} />
        <button type="button" disabled={busy} onClick={() => camera.current?.click()} className="min-h-tap rounded-card bg-accent px-4 text-sm font-medium text-white disabled:opacity-50">
          Take photo
        </button>
        <button type="button" disabled={busy} onClick={() => library.current?.click()} className="min-h-tap rounded-card border border-line px-4 text-sm disabled:opacity-50">
          Choose from library
        </button>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Take photo input" onChange={(e) => void addFiles(e.target.files)} />
        <input ref={library} type="file" accept="image/*" multiple hidden aria-label="Library photo input" onChange={(e) => void addFiles(e.target.files)} />
      </div>
      {busy && <p className="mt-1 text-sm text-muted">Saving…</p>}
      {error && <p role="alert" className="mt-1 text-sm text-accent-text">{error}</p>}

      {photos.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No photos yet. Use the same pose, light and distance each time for useful comparisons.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-muted">{photos.length} photo{photos.length === 1 ? '' : 's'}</span>
            {picking ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted">Pick two ({picking.length}/2)</span>
                <button type="button" className="min-h-tap px-2 text-muted" onClick={() => setPicking(null)}>Cancel</button>
              </span>
            ) : (
              photos.length > 1 && <button type="button" className="min-h-tap px-2 text-sm text-muted" onClick={() => setPicking([])}>Compare</button>
            )}
          </div>
          <ul className="grid grid-cols-3 gap-2">
            {shown.map((p) => {
              const selected = picking?.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-label={`${poseLabel(p.pose)} photo, ${dayLabel(p.date)}`}
                    aria-pressed={picking ? !!selected : undefined}
                    onClick={() => {
                      if (!picking) return setMode({ kind: 'view', id: p.id });
                      const next = selected ? picking.filter((x) => x !== p.id) : [...picking, p.id].slice(-2);
                      if (next.length === 2) {
                        setPicking(null);
                        setMode({ kind: 'compare', ids: next });
                      } else setPicking(next);
                    }}
                    className={`block w-full overflow-hidden rounded-card border ${selected ? 'border-fg' : 'border-line'}`}
                  >
                    {img(p.id, "aspect-[3/4] w-full object-cover")}
                    <span className="block px-1 py-0.5 text-left text-[11px] tabular-nums text-muted">{poseLabel(p.pose)} · {dayLabel(p.date)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {photos.length > SHOWN && (
            <button type="button" onClick={() => setAll((a) => !a)} className="min-h-tap text-sm text-muted">
              {all ? 'Show fewer' : `Show all ${photos.length}`}
            </button>
          )}
        </>
      )}

      {mode.kind !== 'grid' && (
        <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex flex-col bg-bg p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-lg">{mode.kind === 'compare' ? 'Compare' : 'Photo'}</h3>
            <button type="button" onClick={() => { setMode({ kind: 'grid' }); setConfirmDelete(false); }} className="min-h-tap px-3 text-base">Close</button>
          </div>
          {mode.kind === 'view' && byId.get(mode.id) && (
            <>
              <div className="flex min-h-0 flex-1 items-center justify-center">
                {img(mode.id, "max-h-full max-w-full rounded-card object-contain")}
              </div>
              <p className="mt-2 text-sm tabular-nums text-muted">{poseLabel(byId.get(mode.id)!.pose)} · {dayLabel(byId.get(mode.id)!.date)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {POSES.map((p) => (
                  <button key={p.id} type="button" onClick={() => void photoRepo.edit(mode.id, { pose: p.id }).then(() => setTick((t) => t + 1))} className={`min-h-tap rounded-full border px-3 text-sm ${byId.get(mode.id)!.pose === p.id ? 'border-fg text-fg' : 'border-line text-muted'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => (confirmDelete ? void remove(mode.id) : setConfirmDelete(true))} className="mt-3 min-h-tap rounded-card border border-line px-4 text-sm">
                {confirmDelete ? 'Tap again to delete for good' : 'Delete photo'}
              </button>
            </>
          )}
          {mode.kind === 'compare' && (() => {
            const [a, b] = mode.ids.map((id) => byId.get(id)).sort((x, y) => (x!.date < y!.date ? -1 : 1)) as [ProgressPhoto, ProgressPhoto];
            return (
              <>
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
                  {[a, b].map((p) => (
                    <div key={p.id} className="flex min-h-0 flex-col">
                      <div className="flex min-h-0 flex-1 items-center justify-center">
                        {img(p.id, "max-h-full max-w-full rounded-card object-contain")}
                      </div>
                      <p className="mt-1 text-center text-xs tabular-nums text-muted">{poseLabel(p.pose)} · {dayLabel(p.date)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-center text-sm tabular-nums text-muted">{daysBetween(a.date, b.date)} days apart</p>
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}
