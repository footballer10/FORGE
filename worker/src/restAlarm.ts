/**
 * Lock-screen rest alerts (milestone 17a). One Durable Object holds the user's push subscription and the
 * end time of the current rest, and uses a Durable Object alarm to send a payload-less Web Push when the
 * rest ends. The logic lives in `RestScheduler` over a minimal storage interface so it is testable without
 * Cloudflare; `RestAlarm` is the thin Durable Object wrapper.
 */
import { audienceOf, importVapidPrivateKey, vapidAuthorization } from './vapid';

export interface AlarmStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<unknown>;
  setAlarm(scheduledMs: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export interface PushEnv {
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
  /** Contact for the push service (mailto: or https:). Defaults to the Worker's own address. */
  VAPID_SUBJECT?: string;
}
export interface StoredSubscription {
  endpoint: string;
  /** Contact used for the VAPID claims, saved at subscribe time. */
  subject: string;
}

/** Longest rest the app allows is 30 minutes (MAX_REST_SEC); allow a little more for clock skew. */
export const MAX_AHEAD_MS = 35 * 60 * 1000;
/** A rest that already ended longer ago than this is not worth a notification. */
export const MAX_LATE_MS = 60 * 1000;

/** Push services we accept endpoints from (the subscription comes from the phone, so check it before posting to it). */
const PUSH_HOSTS = ['web.push.apple.com', 'push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com', 'notify.windows.com'];
export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export class RestScheduler {
  constructor(
    private storage: AlarmStorage,
    private env: PushEnv,
    private send: typeof fetch = (...a) => fetch(...a),
    private now: () => number = () => Date.now(),
  ) {}

  /** Routes `/api/push/subscribe` (POST), `/api/push/unsubscribe` (POST), `/api/rest` (PUT, DELETE). Auth is checked by the Worker before this. */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/push/subscribe' && request.method === 'POST') return this.subscribe(request, url);
    if (url.pathname === '/api/push/unsubscribe' && request.method === 'POST') {
      await this.storage.delete('subscription');
      await this.clearRest();
      return json({ ok: true });
    }
    if (url.pathname === '/api/rest' && request.method === 'PUT') return this.setRest(request);
    if (url.pathname === '/api/rest' && request.method === 'DELETE') {
      await this.clearRest();
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  }

  private async subscribe(request: Request, url: URL): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { subscription?: { endpoint?: unknown } } | null;
    const endpoint = body?.subscription?.endpoint;
    if (!isPushEndpoint(endpoint)) return json({ error: 'subscription.endpoint must be an https URL of a known push service' }, 400);
    const sub: StoredSubscription = { endpoint, subject: this.env.VAPID_SUBJECT || url.origin };
    await this.storage.put('subscription', sub);
    return json({ ok: true });
  }

  private async setRest(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { endsAt?: unknown } | null;
    const at = typeof body?.endsAt === 'string' ? Date.parse(body.endsAt) : NaN;
    if (Number.isNaN(at)) return json({ error: 'endsAt must be an ISO time' }, 400);
    const now = this.now();
    if (at > now + MAX_AHEAD_MS) return json({ error: 'endsAt is too far ahead' }, 400);
    if (at < now - MAX_LATE_MS) {
      await this.clearRest();
      return json({ scheduled: false });
    }
    if (!(await this.storage.get('subscription'))) return json({ scheduled: false, reason: 'no subscription' });
    await this.storage.put('endsAt', at);
    await this.storage.setAlarm(Math.max(at, now + 1));
    return json({ scheduled: true });
  }

  private async clearRest(): Promise<void> {
    await this.storage.delete('endsAt');
    await this.storage.deleteAlarm();
  }

  /** Called by the Durable Object alarm. */
  async alarm(): Promise<void> {
    const at = await this.storage.get<number>('endsAt');
    const sub = await this.storage.get<StoredSubscription>('subscription');
    await this.storage.delete('endsAt');
    if (at === undefined || !sub) return;
    if (at > this.now() + 2000) {
      // Fired early: put the time back and wait again.
      await this.storage.put('endsAt', at);
      await this.storage.setAlarm(at);
      return;
    }
    if (this.now() - at > MAX_LATE_MS) return; // woke up long after the rest ended
    if (!this.env.VAPID_PUBLIC || !this.env.VAPID_PRIVATE) return;
    const key = await importVapidPrivateKey(this.env.VAPID_PUBLIC, this.env.VAPID_PRIVATE);
    const authorization = await vapidAuthorization(key, this.env.VAPID_PUBLIC, { audience: audienceOf(sub.endpoint), subject: sub.subject, nowSec: Math.floor(this.now() / 1000) });
    const res = await this.send(sub.endpoint, { method: 'POST', headers: { authorization, ttl: '60', urgency: 'high', 'content-length': '0' } });
    // The push service says the phone unsubscribed (or the subscription expired): forget it so we stop trying.
    if (res.status === 404 || res.status === 410) await this.storage.delete('subscription');
  }
}

/** Minimal Durable Object types (the Worker is type-checked without the Cloudflare types package). */
export interface DurableObjectStateLike {
  storage: AlarmStorage;
}
export interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}
export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export class RestAlarm {
  private scheduler: RestScheduler;
  constructor(state: DurableObjectStateLike, env: PushEnv) {
    this.scheduler = new RestScheduler(state.storage, env);
  }
  fetch(request: Request): Promise<Response> {
    return this.scheduler.handle(request);
  }
  alarm(): Promise<void> {
    return this.scheduler.alarm();
  }
}
