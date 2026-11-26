import { describe, expect, it } from 'vitest';
import { RestScheduler, isPushEndpoint, MAX_AHEAD_MS, type AlarmStorage } from './restAlarm';
import { handlePushRoutes } from './pushRoutes';
import { audienceOf, b64uDecode, b64uEncode, generateVapidKeys, importVapidPrivateKey, vapidJwt } from './vapid';
import type { Env } from './sync';

const TOKEN = 'a-long-enough-test-token-1234';
const NOW = Date.parse('2026-11-26T12:00:00Z');
const ENDPOINT = 'https://web.push.apple.com/abc123';

function fakeStorage() {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  const s: AlarmStorage & { data: Map<string, unknown>; alarm: () => number | null } = {
    data,
    alarm: () => alarm,
    async get<T>(k: string) { return data.get(k) as T | undefined; },
    async put(k, v) { data.set(k, v); },
    async delete(k) { return data.delete(k); },
    async setAlarm(ms) { alarm = ms; },
    async deleteAlarm() { alarm = null; },
  };
  return s;
}
const req = (method: string, path: string, body?: unknown) =>
  new Request(`https://forge.example.workers.dev${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

describe('vapid', () => {
  it('base64url round-trips', () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 62, 63]);
    expect(b64uDecode(b64uEncode(bytes))).toEqual(bytes);
    expect(b64uEncode(bytes)).not.toMatch(/[+/=]/);
  });

  it('signs an ES256 JWT with the right claims that the public key verifies', async () => {
    const keys = await generateVapidKeys();
    expect(b64uDecode(keys.publicKey)).toHaveLength(65);
    const key = await importVapidPrivateKey(keys.publicKey, keys.privateKey);
    const jwt = await vapidJwt(key, { audience: audienceOf(ENDPOINT), subject: 'mailto:me@example.com', nowSec: 1000 });
    const [h, c, sig] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(new TextDecoder().decode(b64uDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(b64uDecode(c)))).toEqual({ aud: 'https://web.push.apple.com', exp: 1000 + 12 * 3600, sub: 'mailto:me@example.com' });
    expect(b64uDecode(sig)).toHaveLength(64);
    const pub = await crypto.subtle.importKey('raw', b64uDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64uDecode(sig), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
    // a tampered payload fails
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64uDecode(sig), new TextEncoder().encode(`${h}.x${c}`))).toBe(false);
  });

  it('rejects a malformed public key', async () => {
    await expect(importVapidPrivateKey('AAAA', 'BBBB')).rejects.toThrow(/65-byte/);
  });
});

describe('isPushEndpoint', () => {
  it('accepts known push services over https only', () => {
    expect(isPushEndpoint(ENDPOINT)).toBe(true);
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isPushEndpoint('http://web.push.apple.com/x')).toBe(false);
    expect(isPushEndpoint('https://evil.example.com/x')).toBe(false);
    expect(isPushEndpoint('https://web.push.apple.com.evil.com/x')).toBe(false);
    expect(isPushEndpoint(42)).toBe(false);
  });
});

describe('RestScheduler', () => {
  async function setup(opts: { status?: number } = {}) {
    const keys = await generateVapidKeys();
    const storage = fakeStorage();
    const sent: { url: string; init: RequestInit }[] = [];
    let now = NOW;
    const send = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(null, { status: opts.status ?? 201 });
    }) as unknown as typeof fetch;
    const sch = new RestScheduler(storage, { VAPID_PUBLIC: keys.publicKey, VAPID_PRIVATE: keys.privateKey }, send, () => now);
    return { sch, storage, sent, setNow: (n: number) => (now = n), keys };
  }
  const endsIn = (sec: number) => new Date(NOW + sec * 1000).toISOString();

  it('stores a subscription and schedules the alarm at endsAt', async () => {
    const { sch, storage } = await setup();
    expect((await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: ENDPOINT } }))).status).toBe(200);
    const res = await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(90) }));
    expect(await res.json()).toEqual({ scheduled: true });
    expect(storage.alarm()).toBe(NOW + 90_000);
  });

  it('rescheduling replaces the alarm (±15 s) and delete cancels it', async () => {
    const { sch, storage } = await setup();
    await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: ENDPOINT } }));
    await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(90) }));
    await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(105) }));
    expect(storage.alarm()).toBe(NOW + 105_000);
    await sch.handle(req('DELETE', '/api/rest'));
    expect(storage.alarm()).toBeNull();
    expect(storage.data.has('endsAt')).toBe(false);
  });

  it('rejects bad input and does not schedule without a subscription', async () => {
    const { sch, storage } = await setup();
    expect((await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://evil.example.com/x' } }))).status).toBe(400);
    expect((await sch.handle(req('PUT', '/api/rest', { endsAt: 'nope' }))).status).toBe(400);
    expect((await sch.handle(req('PUT', '/api/rest', { endsAt: new Date(NOW + MAX_AHEAD_MS + 60_000).toISOString() }))).status).toBe(400);
    expect(await (await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(30) }))).json()).toEqual({ scheduled: false, reason: 'no subscription' });
    expect(storage.alarm()).toBeNull();
  });

  it('ignores a rest that already ended long ago', async () => {
    const { sch, storage } = await setup();
    await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: ENDPOINT } }));
    expect(await (await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(-300) }))).json()).toEqual({ scheduled: false });
    expect(storage.alarm()).toBeNull();
  });

  it('on the alarm sends one empty, VAPID-signed push and clears the rest', async () => {
    const { sch, storage, sent, setNow, keys } = await setup();
    await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: ENDPOINT } }));
    await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(60) }));
    setNow(NOW + 60_500);
    await sch.alarm();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(ENDPOINT);
    const h = sent[0]!.init.headers as Record<string, string>;
    expect(h.authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
    expect(h.ttl).toBe('60');
    expect(h.urgency).toBe('high');
    expect(sent[0]!.init.body).toBeUndefined();
    expect(storage.data.has('endsAt')).toBe(false);
    await sch.alarm(); // a second alarm with nothing stored sends nothing
    expect(sent).toHaveLength(1);
  });

  it('does not send when the alarm wakes long after the rest ended', async () => {
    const { sch, sent, setNow } = await setup();
    await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: ENDPOINT } }));
    await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(60) }));
    setNow(NOW + 60_000 + 5 * 60_000);
    await sch.alarm();
    expect(sent).toHaveLength(0);
  });

  it('waits again when the alarm fires early', async () => {
    const { sch, storage, sent } = await setup();
    await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: ENDPOINT } }));
    await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(60) }));
    await sch.alarm(); // now is still NOW, 60 s early
    expect(sent).toHaveLength(0);
    expect(storage.alarm()).toBe(NOW + 60_000);
    expect(storage.data.get('endsAt')).toBe(NOW + 60_000);
  });

  it('drops the subscription when the push service says it is gone (410), keeps it on other errors', async () => {
    for (const [status, kept] of [[410, false], [404, false], [500, true]] as const) {
      const { sch, storage, setNow } = await setup({ status });
      await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: ENDPOINT } }));
      await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(10) }));
      setNow(NOW + 10_000);
      await sch.alarm();
      expect(storage.data.has('subscription')).toBe(kept);
    }
  });

  it('unsubscribe forgets the subscription and cancels the alarm', async () => {
    const { sch, storage } = await setup();
    await sch.handle(req('POST', '/api/push/subscribe', { subscription: { endpoint: ENDPOINT } }));
    await sch.handle(req('PUT', '/api/rest', { endsAt: endsIn(60) }));
    await sch.handle(req('POST', '/api/push/unsubscribe'));
    expect(storage.data.has('subscription')).toBe(false);
    expect(storage.alarm()).toBeNull();
  });
});

describe('push routes on the Worker', () => {
  const stub = (sch: RestScheduler) => ({ idFromName: () => 'id', get: () => ({ fetch: (r: Request) => sch.handle(r) }) });
  const auth = { authorization: `Bearer ${TOKEN}` };
  const call = (env: Partial<Env>, method: string, path: string, headers: Record<string, string> = auth, body?: unknown) =>
    handlePushRoutes(new Request(`https://w.example.workers.dev${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { SYNC_TOKEN: TOKEN, DB: {} as never, ...env } as Env);

  it('ignores other paths', async () => {
    expect(await call({}, 'GET', '/api/health')).toBeNull();
    expect(await call({}, 'POST', '/api/sync/push')).toBeNull();
  });

  it('needs the token, and answers 503 until VAPID and the Durable Object are set up', async () => {
    expect((await call({}, 'GET', '/api/push/key', {}))!.status).toBe(401);
    expect((await call({}, 'GET', '/api/push/key'))!.status).toBe(503);
  });

  it('returns the public key and forwards subscribe and rest calls with CORS headers', async () => {
    const keys = await generateVapidKeys();
    const storage = fakeStorage();
    const sch = new RestScheduler(storage, { VAPID_PUBLIC: keys.publicKey, VAPID_PRIVATE: keys.privateKey }, (async () => new Response(null, { status: 201 })) as unknown as typeof fetch, () => NOW);
    const env = { REST: stub(sch), VAPID_PUBLIC: keys.publicKey, VAPID_PRIVATE: keys.privateKey };
    const key = await call(env, 'GET', '/api/push/key');
    expect(await key!.json()).toEqual({ publicKey: keys.publicKey });
    expect((await call(env, 'POST', '/api/push/subscribe', auth, { subscription: { endpoint: ENDPOINT } }))!.status).toBe(200);
    const put = await call(env, 'PUT', '/api/rest', auth, { endsAt: new Date(NOW + 60_000).toISOString() });
    expect(await put!.json()).toEqual({ scheduled: true });
    expect(put!.headers.get('access-control-allow-origin')).toBe('*');
    expect(storage.alarm()).toBe(NOW + 60_000);
  });
});
