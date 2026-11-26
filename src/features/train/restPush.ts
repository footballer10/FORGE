import { syncRepo } from '../../db/repositories';
import {
  cancelRestRequest, keyRequest, pushUnavailableReason, scheduleRestRequest, subscribeRequest, unsubscribeRequest, urlBase64ToUint8Array,
  type HttpRequest, type PushEndpoint,
} from '../../domain/restPush';

/**
 * Browser side of lock-screen rest alerts (milestone 17b). The Worker keeps the push subscription and the rest end time and
 * sends a Web Push when the rest is over, so the alert arrives with Forge closed or the phone locked. Everything here is
 * best effort and silent: offline or an unreachable Worker leaves the in-app bell as it is.
 */

const KEY = 'forge.pushAlerts';

export function pushAlertsOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function remember(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: lasts for this session only */
  }
}

export function pushSupportMessage(): string | null {
  const nav = navigator as Navigator & { standalone?: boolean };
  return pushUnavailableReason({
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    standalone: nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
    isIos: /iPhone|iPad|iPod/.test(navigator.userAgent),
  });
}

async function endpoint(): Promise<PushEndpoint | undefined> {
  return syncRepo.settings();
}
async function send(r: HttpRequest): Promise<Response> {
  return fetch(r.url, { ...r.init, keepalive: true });
}

/** Ask permission (must run from a tap), subscribe and register with the Worker. Resolves with a message for the user. */
export async function enablePushAlerts(): Promise<{ ok: boolean; message: string }> {
  const blocked = pushSupportMessage();
  if (blocked) return { ok: false, message: blocked };
  const e = await endpoint();
  if (!e) return { ok: false, message: 'Connect Cloud sync first (Settings → Cloud sync): the alerts are sent by your own Worker.' };
  try {
    if ((await Notification.requestPermission()) !== 'granted') return { ok: false, message: 'Notifications were not allowed. Allow them for Forge in the iPhone Settings app, then try again.' };
    const keyRes = await send(keyRequest(e));
    if (keyRes.status === 503) return { ok: false, message: 'The Worker is not set up for alerts yet. Follow the lock-screen alerts steps in docs/connector.md and redeploy it.' };
    if (!keyRes.ok) return { ok: false, message: `The Worker answered ${keyRes.status}. Check Cloud sync.` };
    const { publicKey } = (await keyRes.json()) as { publicKey: string };
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    const res = await send(subscribeRequest(e, sub.toJSON()));
    if (!res.ok) return { ok: false, message: `The Worker refused the subscription (${res.status}).` };
    remember(true);
    return { ok: true, message: 'On. Use the test button, then lock your phone and wait.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not turn on alerts.' };
  }
}

export async function disablePushAlerts(): Promise<void> {
  remember(false);
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    const e = await endpoint();
    if (e) await send(unsubscribeRequest(e));
  } catch {
    /* already off on this device; the Worker drops a dead subscription on its next push */
  }
}

/** Tell the Worker when the rest ends (start of a rest and every ±15 s). */
export async function scheduleRestPush(endsAt: string): Promise<void> {
  if (!pushAlertsOn()) return;
  try {
    const e = await endpoint();
    if (e) await send(scheduleRestRequest(e, endsAt));
  } catch {
    /* offline: the in-app bell still works */
  }
}

/** Skip, finish or discard: no alert is wanted any more. */
export async function cancelRestPush(): Promise<void> {
  if (!pushAlertsOn()) return;
  try {
    const e = await endpoint();
    if (e) await send(cancelRestRequest(e));
  } catch {
    /* offline: the Worker ignores a rest that ended long ago */
  }
}
