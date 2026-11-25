import { useCallback, useEffect, useState } from 'react';
import { syncRepo, type SyncStatus } from '../../db/repositories';

const input = 'min-h-tap w-full rounded-card border border-line bg-bg px-3 text-base text-fg';
const btn = 'min-h-tap rounded-card border border-line px-4 text-sm text-fg disabled:opacity-50';

/** Cloud sync with the user's own Cloudflare Worker (docs/connector.md). Off until a URL and token are saved. */
export function SyncPanel() {
  const [status, setStatus] = useState<SyncStatus>();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const refresh = useCallback(async () => setStatus(await syncRepo.status()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy(true);
    setNote('');
    const r = await syncRepo.sync();
    setNote(r.error ? '' : `Sent ${r.pushed}, received ${r.pulled}.`);
    await refresh();
    setBusy(false);
  };
  const save = async () => {
    await syncRepo.configure(url, token);
    setToken('');
    await refresh();
    await run();
  };

  return (
    <section className="rounded-card border border-line bg-surface px-4 py-3" aria-label="Cloud sync">
      <h2 className="text-sm text-muted">Cloud sync</h2>
      <p className="mt-1 text-xs text-muted">
        Optional. A full copy of your training data is stored in your own Cloudflare account so Claude can read it later. Photos stay on this device. Setup steps are in docs/connector.md.
      </p>
      {status?.configured ? (
        <div className="mt-3 space-y-2">
          <p className="break-all text-sm">Connected to {status.url}</p>
          <p className="text-xs text-muted">
            {status.lastSyncAt ? `Last synced ${new Date(status.lastSyncAt).toLocaleString()}.` : 'Not synced yet.'} {status.pending} change{status.pending === 1 ? '' : 's'} waiting to upload.
          </p>
          {status.lastError && <p role="alert" className="text-sm text-accent-text">{status.lastError}</p>}
          {note && <p className="text-sm">{note}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={run}>{busy ? 'Syncing…' : 'Sync now'}</button>
            <button type="button" className={btn} disabled={busy} onClick={async () => { await syncRepo.resetUpload(); await refresh(); }}>Re-upload everything</button>
            <button type="button" className={btn} disabled={busy} onClick={async () => { await syncRepo.disconnect(); await refresh(); }}>Disconnect</button>
          </div>
          <p className="text-xs text-muted">Re-upload everything after a restore or import. Sync also happens when you tap Sync now; it does not run in the background.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input className={input} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="Worker URL (https://…workers.dev)" aria-label="Worker URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className={input} type="password" autoCapitalize="none" autoCorrect="off" placeholder="Sync token" aria-label="Sync token" value={token} onChange={(e) => setToken(e.target.value)} />
          <button type="button" className={btn} disabled={busy || !/^https:\/\//.test(url.trim()) || token.trim().length < 16} onClick={save}>Connect and sync</button>
          {status?.lastError && <p role="alert" className="text-sm text-accent-text">{status.lastError}</p>}
        </div>
      )}
    </section>
  );
}
