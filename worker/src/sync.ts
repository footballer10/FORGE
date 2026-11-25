/**
 * Forge sync backend (milestone 10a). Plain handler over a minimal D1 interface so it can be
 * tested against SQLite without Cloudflare types.
 *
 * Model: every synced row is stored as JSON in one table, keyed by (table, id). Conflict rule is
 * last-writer-wins by `updatedAt` (same as merge restore); ties keep the stored row.
 * Each accepted write gets a new `seq`; clients pull rows with seq greater than their cursor.
 */

export interface D1Result<T = unknown> {
  results?: T[];
  meta?: { changes?: number };
}
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = unknown>(): Promise<D1Result<T>>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}
export interface Env {
  DB: D1Like;
  SYNC_TOKEN: string;
}

/** Tables that sync. Photos (large blobs), the undo stack, meta and raw import rows stay on the device. */
export const SYNCED_TABLES = [
  'exercises',
  'workouts',
  'workoutExercises',
  'sets',
  'routines',
  'programs',
  'programWeeks',
  'plannedSessions',
  'bodyMetrics',
  'fitnessTests',
  'testResults',
  'readiness',
  'profile',
  'importBatches',
  'achievements',
  'aiDecisions',
  'nutritionEntries',
  'savedFoods',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const MAX_PUSH_ROWS = 200;
export const MAX_PULL_ROWS = 500;

export interface SyncRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  [key: string]: unknown;
}
export interface PushBody {
  rows: { table: string; row: SyncRow }[];
}
export interface PushResponse {
  accepted: number;
  skipped: number;
  cursor: number;
}
export interface PullResponse {
  rows: { table: SyncedTable; row: SyncRow; seq: number }[];
  cursor: number;
  more: boolean;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-max-age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS },
  });
}
const fail = (status: number, error: string) => json({ error }, status);

/** Compare without exiting early on the first differing character. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function isAuthorized(request: Request, env: Env): boolean {
  if (!env.SYNC_TOKEN || env.SYNC_TOKEN.length < 16) return false; // refuse to run with a weak or missing secret
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  return !!match && safeEqual(match[1]!, env.SYNC_TOKEN);
}

const isTable = (t: unknown): t is SyncedTable => typeof t === 'string' && (SYNCED_TABLES as readonly string[]).includes(t);
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length >= 10 && !Number.isNaN(Date.parse(v));

export function validateRow(table: unknown, row: unknown): string | null {
  if (!isTable(table)) return `Unknown table: ${String(table)}`;
  if (!row || typeof row !== 'object') return 'Row must be an object';
  const r = row as Record<string, unknown>;
  if (table === 'profile' ? typeof r.id !== 'string' : typeof r.id !== 'string' || r.id.length === 0) return 'Row needs a string id';
  if (!isIso(r.updatedAt)) return 'Row needs an ISO updatedAt';
  if (!isIso(r.createdAt)) return 'Row needs an ISO createdAt';
  if (r.deletedAt !== undefined && !isIso(r.deletedAt)) return 'deletedAt must be ISO when present';
  return null;
}

async function currentCursor(db: D1Like): Promise<number> {
  const res = await db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM rows').all<{ seq: number }>();
  return res.results?.[0]?.seq ?? 0;
}

/** Write rows with the last-writer-wins rule; returns how many were stored. */
export async function upsertRows(db: D1Like, rows: { table: string; row: SyncRow }[]): Promise<number> {
  if (!rows.length) return 0;
  const upsert = `INSERT INTO rows (table_name, id, updated_at, deleted_at, data, seq)
    VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM rows))
    ON CONFLICT (table_name, id) DO UPDATE SET
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, data = excluded.data, seq = excluded.seq
    WHERE excluded.updated_at > rows.updated_at`;
  const results = await db.batch(
    rows.map(({ table, row }) => db.prepare(upsert).bind(table, row.id, row.updatedAt, row.deletedAt ?? null, JSON.stringify(row))),
  );
  return results.reduce((n, r) => n + ((r.meta?.changes ?? 0) > 0 ? 1 : 0), 0);
}

export async function handlePush(db: D1Like, body: unknown): Promise<Response> {
  const rows = (body as PushBody | null)?.rows;
  if (!Array.isArray(rows)) return fail(400, 'Body must be { rows: [...] }');
  if (rows.length > MAX_PUSH_ROWS) return fail(413, `At most ${MAX_PUSH_ROWS} rows per push`);
  for (const item of rows) {
    const problem = validateRow(item?.table, item?.row);
    if (problem) return fail(400, problem);
  }
  const accepted = await upsertRows(db, rows);
  const out: PushResponse = { accepted, skipped: rows.length - accepted, cursor: await currentCursor(db) };
  return json(out);
}

export async function handlePull(db: D1Like, url: URL): Promise<Response> {
  const since = Number(url.searchParams.get('since') ?? '0');
  const asked = Number(url.searchParams.get('limit') ?? MAX_PULL_ROWS);
  if (!Number.isInteger(since) || since < 0) return fail(400, 'since must be a non-negative integer');
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_PULL_ROWS) : MAX_PULL_ROWS;
  const res = await db
    .prepare('SELECT table_name, data, seq FROM rows WHERE seq > ? ORDER BY seq LIMIT ?')
    .bind(since, limit + 1)
    .all<{ table_name: SyncedTable; data: string; seq: number }>();
  const found = res.results ?? [];
  const more = found.length > limit;
  const page = found.slice(0, limit);
  const out: PullResponse = {
    rows: page.map((r) => ({ table: r.table_name, row: JSON.parse(r.data) as SyncRow, seq: r.seq })),
    cursor: page.length ? page[page.length - 1]!.seq : since,
    more,
  };
  return json(out);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/api/health') return json({ ok: true });
  if (!url.pathname.startsWith('/api/sync/')) return fail(404, 'Not found');
  if (!isAuthorized(request, env)) return fail(401, 'Unauthorized');

  if (url.pathname === '/api/sync/push' && request.method === 'POST') {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, 'Invalid JSON');
    }
    return handlePush(env.DB, body);
  }
  if (url.pathname === '/api/sync/pull' && request.method === 'GET') return handlePull(env.DB, url);
  return fail(405, 'Method not allowed');
}
