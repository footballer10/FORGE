/**
 * Request builders for lock-screen rest alerts (milestone 17). Pure: they only describe the HTTP calls the app makes to
 * the user's own Worker (worker/src/pushRoutes.ts), so the shapes are testable without a browser.
 */

export interface PushEndpoint {
  /** Worker base URL without a trailing slash. */
  url: string;
  token: string;
}
export interface HttpRequest {
  url: string;
  init: { method: string; headers: Record<string, string>; body?: string };
}

const call = (e: PushEndpoint, method: string, path: string, body?: unknown): HttpRequest => ({
  url: `${e.url.replace(/\/+$/, '')}${path}`,
  init: {
    method,
    headers: { authorization: `Bearer ${e.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  },
});

export const keyRequest = (e: PushEndpoint) => call(e, 'GET', '/api/push/key');
export const subscribeRequest = (e: PushEndpoint, subscription: unknown) => call(e, 'POST', '/api/push/subscribe', { subscription });
export const unsubscribeRequest = (e: PushEndpoint) => call(e, 'POST', '/api/push/unsubscribe', {});
/** The rest ends at `endsAt` (ISO). Sent when a rest starts and on every ±15 s change. */
export const scheduleRestRequest = (e: PushEndpoint, endsAt: string) => call(e, 'PUT', '/api/rest', { endsAt });
export const cancelRestRequest = (e: PushEndpoint) => call(e, 'DELETE', '/api/rest');

/** The VAPID public key arrives as base64url; `pushManager.subscribe` wants bytes. */
export function urlBase64ToUint8Array(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export interface PushSupportInput {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  /** Installed to the Home Screen (display-mode standalone / navigator.standalone). */
  standalone: boolean;
  isIos: boolean;
}
/** Why alerts cannot be turned on here, in words for the user; null when they can. */
export function pushUnavailableReason(s: PushSupportInput): string | null {
  if (s.isIos && !s.standalone) return 'Add Forge to your Home Screen first (Share, then Add to Home Screen), then open it from there. iPhone only allows lock-screen alerts for installed web apps.';
  if (!s.hasServiceWorker || !s.hasPushManager || !s.hasNotification) return 'This browser does not support lock-screen alerts.';
  return null;
}
