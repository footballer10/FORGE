// @vitest-environment node
// @ts-ignore node:sqlite has no bundled types here (runs on Node 22+)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleRequest, safeEqual, MAX_PUSH_ROWS, type D1Like, type D1Statement, type Env } from './sync';

/** Minimal D1 look-alike over node:sqlite so the real SQL runs in tests. */
function fakeD1(): D1Like {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...v) => stmt(sql, v),
    async all<T>() {
      const s = sqlite.prepare(sql);
      if (/^\s*select/i.test(sql)) return { results: s.all(...(values as never[])) as T[] };
      const info = s.run(...(values as never[]));
      return { meta: { changes: Number(info.changes) } };
    },
  });
  return {
    prepare: (sql) => stmt(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.all());
        sqlite.exec('COMMIT');
        return out;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const TOKEN = 'a-long-secret-token-for-tests';
let env: Env;
beforeEach(() => {
  env = { DB: fakeD1(), SYNC_TOKEN: TOKEN };
});

const call = (path: string, init: RequestInit = {}, token: string | null = TOKEN) =>
  handleRequest(
    new Request(`https://forge.test${path}`, {
      ...init,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    }),
    env,
  );
const push = (rows: unknown[]) => call('/api/sync/push', { method: 'POST', body: JSON.stringify({ rows }) });
const row = (id: string, updatedAt: string, extra: object = {}) => ({
  table: 'workouts',
  row: { id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt, ...extra },
});

describe('auth', () => {
  it('health is open', async () => {
    expect((await call('/api/health', {}, null)).status).toBe(200);
  });
  it('rejects a missing or wrong token', async () => {
    expect((await call('/api/sync/pull', {}, null)).status).toBe(401);
    expect((await call('/api/sync/pull', {}, 'wrong-token-wrong-token')).status).toBe(401);
  });
  it('refuses to run with a short or missing secret', async () => {
    env = { ...env, SYNC_TOKEN: 'short' };
    expect((await call('/api/sync/pull', {}, 'short')).status).toBe(401);
    env = { ...env, SYNC_TOKEN: '' };
    expect((await call('/api/sync/pull', {}, '')).status).toBe(401);
  });
  it('safeEqual compares fully', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
  it('answers CORS preflight', async () => {
    const res = await handleRequest(new Request('https://forge.test/api/sync/push', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
  });
});

describe('push and pull', () => {
  it('round-trips rows in change order', async () => {
    const res = await push([row('a', '2026-02-01T10:00:00.000Z', { name: 'A' }), row('b', '2026-02-01T11:00:00.000Z')]);
    expect(await res.json()).toEqual({ accepted: 2, skipped: 0, cursor: 2 });
    const pulled = await (await call('/api/sync/pull?since=0')).json();
    expect(pulled.rows.map((r: { row: { id: string } }) => r.row.id)).toEqual(['a', 'b']);
    expect(pulled.rows[0].row.name).toBe('A');
    expect(pulled).toMatchObject({ cursor: 2, more: false });
  });

  it('pull since the cursor returns only newer changes', async () => {
    await push([row('a', '2026-02-01T10:00:00.000Z')]);
    await push([row('b', '2026-02-01T11:00:00.000Z')]);
    const pulled = await (await call('/api/sync/pull?since=1')).json();
    expect(pulled.rows).toHaveLength(1);
    expect(pulled.rows[0].row.id).toBe('b');
    const empty = await (await call('/api/sync/pull?since=2')).json();
    expect(empty).toEqual({ rows: [], cursor: 2, more: false });
  });

  it('last writer wins by updatedAt; ties and older rows are skipped', async () => {
    await push([row('a', '2026-02-01T10:00:00.000Z', { name: 'old' })]);
    const newer = await (await push([row('a', '2026-02-02T10:00:00.000Z', { name: 'new' })])).json();
    expect(newer.accepted).toBe(1);
    const older = await (await push([row('a', '2026-02-01T09:00:00.000Z', { name: 'stale' })])).json();
    expect(older).toMatchObject({ accepted: 0, skipped: 1 });
    const tie = await (await push([row('a', '2026-02-02T10:00:00.000Z', { name: 'tie' })])).json();
    expect(tie.skipped).toBe(1);
    const pulled = await (await call('/api/sync/pull')).json();
    expect(pulled.rows).toHaveLength(1);
    expect(pulled.rows[0].row.name).toBe('new');
  });

  it('an updated row moves to the end of the change feed', async () => {
    await push([row('a', '2026-02-01T10:00:00.000Z'), row('b', '2026-02-01T10:00:00.000Z')]);
    await push([row('a', '2026-02-03T10:00:00.000Z')]);
    const pulled = await (await call('/api/sync/pull?since=2')).json();
    expect(pulled.rows.map((r: { row: { id: string } }) => r.row.id)).toEqual(['a']);
  });

  it('syncs soft deletes as ordinary rows', async () => {
    await push([row('a', '2026-02-01T10:00:00.000Z')]);
    await push([row('a', '2026-02-02T10:00:00.000Z', { deletedAt: '2026-02-02T10:00:00.000Z' })]);
    const pulled = await (await call('/api/sync/pull')).json();
    expect(pulled.rows[0].row.deletedAt).toBe('2026-02-02T10:00:00.000Z');
  });

  it('keeps tables separate for the same id', async () => {
    await push([
      row('x', '2026-02-01T10:00:00.000Z'),
      { table: 'sets', row: { id: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T10:00:00.000Z' } },
    ]);
    const pulled = await (await call('/api/sync/pull')).json();
    expect(pulled.rows.map((r: { table: string }) => r.table)).toEqual(['workouts', 'sets']);
  });

  it('pages with limit and reports more', async () => {
    await push([1, 2, 3].map((n) => row(`r${n}`, `2026-02-0${n}T10:00:00.000Z`)));
    const first = await (await call('/api/sync/pull?since=0&limit=2')).json();
    expect(first.rows).toHaveLength(2);
    expect(first).toMatchObject({ more: true, cursor: 2 });
    const second = await (await call(`/api/sync/pull?since=${first.cursor}&limit=2`)).json();
    expect(second).toMatchObject({ more: false, cursor: 3 });
    expect(second.rows).toHaveLength(1);
  });

  it('an empty push is fine', async () => {
    expect(await (await push([])).json()).toEqual({ accepted: 0, skipped: 0, cursor: 0 });
  });
});

describe('validation', () => {
  it('rejects unknown and device-only tables', async () => {
    expect((await push([{ ...row('a', '2026-02-01T10:00:00.000Z'), table: 'progressPhotos' }])).status).toBe(400);
    expect((await push([{ ...row('a', '2026-02-01T10:00:00.000Z'), table: 'nope' }])).status).toBe(400);
  });
  it('rejects bad rows and rejects the whole push', async () => {
    const bad = { table: 'workouts', row: { id: 'b', createdAt: 'x', updatedAt: 'y' } };
    expect((await push([row('a', '2026-02-01T10:00:00.000Z'), bad])).status).toBe(400);
    expect((await (await call('/api/sync/pull')).json()).rows).toHaveLength(0);
  });
  it('rejects oversized pushes, bad JSON, bad cursors', async () => {
    const many = Array.from({ length: MAX_PUSH_ROWS + 1 }, (_, i) => row(`r${i}`, '2026-02-01T10:00:00.000Z'));
    expect((await push(many)).status).toBe(413);
    expect((await call('/api/sync/push', { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await call('/api/sync/push', { method: 'POST', body: '{}' })).status).toBe(400);
    expect((await call('/api/sync/pull?since=-1')).status).toBe(400);
    expect((await call('/api/sync/pull?since=abc')).status).toBe(400);
  });
  it('404 and 405', async () => {
    expect((await call('/nope')).status).toBe(404);
    expect((await call('/api/sync/push')).status).toBe(405);
  });
});
