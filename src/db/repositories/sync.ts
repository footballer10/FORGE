import { db } from '../schema';

/**
 * Cloud sync client (milestone 10b). Talks to the Worker in `worker/` (see docs/connector.md).
 * Nothing here runs unless the user saved a Worker URL and token in Settings.
 *
 * Offline safety: there is no separate queue. A push sends every row whose `updatedAt` is at or
 * after the saved push watermark, and the watermark only moves after the server accepted the
 * batch. A failed or offline sync therefore just retries the same rows next time.
 * Conflict rule: last writer wins by `updatedAt` (ties keep the local row), same as the server.
 */

/** Must match SYNCED_TABLES in worker/src/sync.ts. */
export const SYNC_TABLES = [
  'exercises', 'workouts', 'workoutExercises', 'sets', 'routines', 'programs', 'programWeeks',
  'plannedSessions', 'bodyMetrics', 'fitnessTests', 'testResults', 'readiness', 'profile',
  'importBatches', 'achievements', 'aiDecisions',
] as const;

export const PUSH_BATCH = 200;

const K = {
  url: 'sync.url',
  token: 'sync.token',
  cursor: 'sync.cursor',
  pushedAt: 'sync.pushedAt',
  lastSyncAt: 'sync.lastSyncAt',
  lastError: 'sync.lastError',
} as const;

type Row = { id: string; updatedAt: string; [k: string]: unknown };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface SyncSettings {
  url: string;
  token: string;
}
export interface SyncStatus {
  configured: boolean;
  url: string;
  hasToken: boolean;
  lastSyncAt?: string;
  lastError?: string;
  /** Rows changed on this device and not yet uploaded. */
  pending: number;
}
export interface SyncResult {
  pushed: number;
  pulled: number;
}

const get = async <T>(key: string) => (await db.meta.get(key))?.value as T | undefined;
const set = (key: string, value: unknown) => db.meta.put({ key, value });

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function changedRows(since: string | undefined): Promise<{ table: string; row: Row }[]> {
  const out: { table: string; row: Row }[] = [];
  for (const table of SYNC_TABLES) {
    const rows = (await db.table(table).toArray()) as Row[];
    for (const row of rows) if (!since || row.updatedAt >= since) out.push({ table, row });
  }
  return out;
}

async function call(f: FetchLike, s: SyncSettings, path: string, init?: RequestInit): Promise<Response> {
  const res = await f(`${normalizeUrl(s.url)}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
  });
  if (res.status === 401) throw new Error('The Worker rejected the token (401). Check the token in Settings.');
  if (!res.ok) throw new Error(`Sync failed (HTTP ${res.status}).`);
  return res;
}

export const syncRepo = {
  async settings(): Promise<SyncSettings | undefined> {
    const [url, token] = [await get<string>(K.url), await get<string>(K.token)];
    return url && token ? { url, token } : undefined;
  },

  /** Saving new connection details starts a fresh full sync. */
  async configure(url: string, token: string): Promise<void> {
    await Promise.all([set(K.url, normalizeUrl(url)), set(K.token, token.trim()), set(K.cursor, 0), db.meta.delete(K.pushedAt), db.meta.delete(K.lastError)]);
  },

  async disconnect(): Promise<void> {
    await db.meta.bulkDelete(Object.values(K));
  },

  /** Upload everything again on the next sync (use after a restore or import that kept old timestamps). */
  async resetUpload(): Promise<void> {
    await db.meta.delete(K.pushedAt);
  },

  async status(): Promise<SyncStatus> {
    const s = await this.settings();
    return {
      configured: !!s,
      url: (await get<string>(K.url)) ?? '',
      hasToken: !!(await get<string>(K.token)),
      lastSyncAt: await get<string>(K.lastSyncAt),
      lastError: await get<string>(K.lastError),
      pending: s ? (await changedRows(await get<string>(K.pushedAt))).length : 0,
    };
  },

  /** Push local changes, then pull remote ones. Never throws: failures are stored as lastError. */
  async sync(f: FetchLike = (u, i) => fetch(u, i)): Promise<SyncResult & { error?: string }> {
    const s = await this.settings();
    if (!s) return { pushed: 0, pulled: 0, error: 'Sync is not set up.' };
    const result: SyncResult = { pushed: 0, pulled: 0 };
    try {
      // Push. The watermark advances batch by batch, only after the server accepts each one.
      const pushedAt = await get<string>(K.pushedAt);
      const pending = (await changedRows(pushedAt)).sort((a, b) => (a.row.updatedAt < b.row.updatedAt ? -1 : 1));
      for (let i = 0; i < pending.length; i += PUSH_BATCH) {
        const batch = pending.slice(i, i + PUSH_BATCH);
        await call(f, s, '/api/sync/push', { method: 'POST', body: JSON.stringify({ rows: batch }) });
        result.pushed += batch.length;
        await set(K.pushedAt, batch[batch.length - 1]!.row.updatedAt);
      }
      // Pull.
      let cursor = (await get<number>(K.cursor)) ?? 0;
      for (;;) {
        const res = await call(f, s, `/api/sync/pull?since=${cursor}`);
        const page = (await res.json()) as { rows: { table: string; row: Row }[]; cursor: number; more: boolean };
        for (const { table, row } of page.rows) {
          if (!(SYNC_TABLES as readonly string[]).includes(table)) continue;
          const local = (await db.table(table).get(row.id)) as Row | undefined;
          if (!local || local.updatedAt < row.updatedAt) {
            await db.table(table).put(row);
            result.pulled++;
          }
        }
        cursor = page.cursor;
        await set(K.cursor, cursor);
        if (!page.more) break;
      }
      await set(K.lastSyncAt, new Date().toISOString());
      await db.meta.delete(K.lastError);
      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Sync failed.';
      await set(K.lastError, error);
      return { ...result, error };
    }
  },
};
