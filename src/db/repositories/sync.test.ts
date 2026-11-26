import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, exerciseRepo, syncRepo } from './index';
import { db } from '../schema';
import { PUSH_BATCH } from './sync';

const ex = { name: 'Squat', aliases: [], equipment: 'barbell' as const, primaryMuscles: [], secondaryMuscles: [], pattern: 'squat' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const };

/** Tiny in-memory stand-in for the Worker (same contract as worker/src/sync.ts). */
function fakeServer() {
  const rows = new Map<string, { table: string; row: any; seq: number }>();
  let seq = 0;
  const pushes: number[] = [];
  let down = false;
  const f = async (url: string, init?: RequestInit) => {
    if (down) throw new TypeError('offline');
    const auth = (init?.headers as Record<string, string>).authorization;
    if (auth !== 'Bearer secret-token-1234567') return new Response('{}', { status: 401 });
    const u = new URL(url);
    if (u.pathname.endsWith('/push')) {
      const body = JSON.parse(init!.body as string) as { rows: { table: string; row: any }[] };
      pushes.push(body.rows.length);
      for (const { table, row } of body.rows) {
        const k = `${table}/${row.id}`;
        const ex = rows.get(k);
        if (!ex || row.updatedAt > ex.row.updatedAt) rows.set(k, { table, row, seq: ++seq });
      }
      return Response.json({ accepted: body.rows.length, skipped: 0, cursor: seq });
    }
    const since = Number(u.searchParams.get('since'));
    const all = [...rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const page = all.slice(0, 2);
    return Response.json({ rows: page, cursor: page.length ? page[page.length - 1]!.seq : since, more: all.length > 2 });
  };
  return { f, rows, pushes, setDown: (v: boolean) => (down = v) };
}

beforeEach(async () => {
  await clearAllData();
});

describe('syncRepo', () => {
  it('restores a fresh install from the cloud without duplicate exercises or a blank profile winning', async () => {
    const srv = fakeServer();
    // Phone before the app was removed: data synced to the cloud.
    await syncRepo.configure('https://w.test', 'secret-token-1234567');
    const squat = await exerciseRepo.create({ ...ex, sourceRef: 'Barbell_Squat' });
    const { profileRepo, workoutRepo } = await import('./index');
    await profileRepo.update({ position: 'Fullback', plannedDaysPerWeek: 3 });
    const w = await workoutRepo.start({ name: 'A Day' });
    await workoutRepo.finish(w.id);
    await syncRepo.sync(srv.f);

    // App removed and added again: everything local is gone; first launch seeds a new library row and a default profile.
    await clearAllData();
    await exerciseRepo.create({ ...ex, sourceRef: 'Barbell_Squat' });
    await profileRepo.update({ plannedDaysPerWeek: 5 });

    const r = await syncRepo.restoreFromCloud('https://w.test', 'secret-token-1234567', srv.f);
    expect(r.error).toBeUndefined();
    const all = await exerciseRepo.list();
    expect(all.map((e) => e.id)).toEqual([squat.id]); // the cloud's exercise, no duplicate
    expect((await profileRepo.get()).plannedDaysPerWeek).toBe(3); // the cloud profile, not the blank one
    expect(await workoutRepo.listHistory()).toHaveLength(1);
    expect((await syncRepo.status()).configured).toBe(true);
  });

  it('refuses to wipe a phone that already has workouts', async () => {
    const { workoutRepo } = await import('./index');
    const w = await workoutRepo.start({ name: 'Here' });
    await workoutRepo.finish(w.id);
    const r = await syncRepo.restoreFromCloud('https://w.test', 'secret-token-1234567', fakeServer().f);
    expect(r.error).toMatch(/already has workouts/);
    expect(await workoutRepo.listHistory()).toHaveLength(1);
  });

  it('does nothing until configured', async () => {
    expect((await syncRepo.sync(fakeServer().f)).error).toMatch(/not set up/);
    expect((await syncRepo.status()).configured).toBe(false);
  });

  it('pushes new rows, then only changes after that', async () => {
    const srv = fakeServer();
    await syncRepo.configure('https://w.test/', 'secret-token-1234567');
    const e = await exerciseRepo.create(ex);
    expect((await syncRepo.status()).pending).toBeGreaterThan(0);
    const r1 = await syncRepo.sync(srv.f);
    expect(r1.error).toBeUndefined();
    expect(srv.rows.has(`exercises/${e.id}`)).toBe(true);
    await syncRepo.sync(srv.f);
    // second sync re-sends at most the rows on the watermark timestamp
    expect(srv.pushes[srv.pushes.length - 1]!).toBeLessThanOrEqual(2);
    await exerciseRepo.update(e.id, { name: 'Back squat' });
    await syncRepo.sync(srv.f);
    expect(srv.rows.get(`exercises/${e.id}`)!.row.name).toBe('Back squat');
    expect((await syncRepo.status()).lastSyncAt).toBeTruthy();
  });

  it('pulls rows from another device across pages, newest wins', async () => {
    const srv = fakeServer();
    await syncRepo.configure('https://w.test', 'secret-token-1234567');
    const mine = await exerciseRepo.create({ ...ex, name: 'Mine' });
    await syncRepo.sync(srv.f);
    const t = (n: number) => new Date(Date.now() + n * 1000).toISOString();
    for (const [i, name] of ['A', 'B', 'C'].entries())
      srv.rows.set(`exercises/r${i}`, { table: 'exercises', row: { ...ex, id: `r${i}`, name, createdAt: t(1), updatedAt: t(1) }, seq: 100 + i });
    // remote edit newer than local
    srv.rows.set(`exercises/${mine.id}`, { table: 'exercises', row: { ...mine, name: 'Edited elsewhere', updatedAt: t(5) }, seq: 200 });
    const res = await syncRepo.sync(srv.f);
    expect(res.pulled).toBe(4);
    expect((await db.exercises.get('r2'))!.name).toBe('C');
    expect((await db.exercises.get(mine.id))!.name).toBe('Edited elsewhere');
    // an older remote row does not overwrite a newer local one
    await exerciseRepo.update(mine.id, { name: 'Local newest' });
    srv.rows.set(`exercises/${mine.id}`, { table: 'exercises', row: { ...mine, name: 'Stale', updatedAt: t(-50) }, seq: 300 });
    await syncRepo.sync(srv.f);
    expect((await db.exercises.get(mine.id))!.name).toBe('Local newest');
  });

  it('offline: keeps the changes pending, records the error, and catches up later', async () => {
    const srv = fakeServer();
    await syncRepo.configure('https://w.test', 'secret-token-1234567');
    await exerciseRepo.create(ex);
    srv.setDown(true);
    const failed = await syncRepo.sync(srv.f);
    expect(failed.error).toBeTruthy();
    const st = await syncRepo.status();
    expect(st.lastError).toBeTruthy();
    expect(st.pending).toBeGreaterThan(0);
    srv.setDown(false);
    expect((await syncRepo.sync(srv.f)).error).toBeUndefined();
    expect(srv.rows.size).toBe(1);
    expect((await syncRepo.status()).lastError).toBeUndefined();
  });

  it('tells the user to redeploy when the Worker does not know a table', async () => {
    await exerciseRepo.create(ex);
    await syncRepo.configure('https://w.test', 'secret-token-1234567');
    const old = async () => new Response(JSON.stringify({ error: 'Unknown table: nutritionEntries' }), { status: 400 });
    const r = await syncRepo.sync(old);
    expect(r.error).toMatch(/npx wrangler deploy/);
    expect((await syncRepo.status()).lastError).toMatch(/out of date/);
  });

  it('reports a wrong token plainly', async () => {
    await syncRepo.configure('https://w.test', 'wrong-token-1234567890');
    await exerciseRepo.create(ex);
    expect((await syncRepo.sync(fakeServer().f)).error).toMatch(/token/);
  });

  it('uploads in batches and resetUpload re-sends everything', async () => {
    const srv = fakeServer();
    await syncRepo.configure('https://w.test', 'secret-token-1234567');
    const base = new Date().toISOString();
    await db.exercises.bulkAdd(Array.from({ length: PUSH_BATCH + 5 }, (_, i) => ({ ...ex, id: `b${i}`, createdAt: base, updatedAt: base }) as never));
    await syncRepo.sync(srv.f);
    expect(srv.pushes.slice(0, 2)).toEqual([PUSH_BATCH, 5]);
    srv.pushes.length = 0;
    await syncRepo.resetUpload();
    await syncRepo.sync(srv.f);
    expect(srv.pushes.reduce((a, b) => a + b, 0)).toBe(PUSH_BATCH + 5);
  });

  it('disconnect clears settings', async () => {
    await syncRepo.configure('https://w.test', 'secret-token-1234567');
    await syncRepo.disconnect();
    expect((await syncRepo.status()).configured).toBe(false);
  });
});
