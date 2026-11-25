// Test helper only: a D1 look-alike over node:sqlite so the real SQL runs in tests (Node 22+).
// @ts-ignore node:sqlite has no bundled types here
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Like, D1Statement } from './sync';

export /** Minimal D1 look-alike over node:sqlite so the real SQL runs in tests. */
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
