import { describe, expect, it } from 'vitest';
import { cancelRestRequest, keyRequest, pushUnavailableReason, scheduleRestRequest, subscribeRequest, unsubscribeRequest, urlBase64ToUint8Array } from './restPush';

const E = { url: 'https://forge.example.workers.dev/', token: 'secret-token-1234567' };

describe('restPush requests', () => {
  it('builds authorised calls against the Worker without a double slash', () => {
    expect(keyRequest(E)).toEqual({ url: 'https://forge.example.workers.dev/api/push/key', init: { method: 'GET', headers: { authorization: 'Bearer secret-token-1234567' } } });
    const put = scheduleRestRequest(E, '2026-11-26T12:00:00.000Z');
    expect(put.url).toBe('https://forge.example.workers.dev/api/rest');
    expect(put.init.method).toBe('PUT');
    expect(JSON.parse(put.init.body!)).toEqual({ endsAt: '2026-11-26T12:00:00.000Z' });
    expect(put.init.headers['content-type']).toBe('application/json');
    expect(cancelRestRequest(E).init).toEqual({ method: 'DELETE', headers: { authorization: 'Bearer secret-token-1234567' } });
    expect(JSON.parse(subscribeRequest(E, { endpoint: 'https://web.push.apple.com/x' }).init.body!)).toEqual({ subscription: { endpoint: 'https://web.push.apple.com/x' } });
    expect(unsubscribeRequest(E).url).toMatch(/\/api\/push\/unsubscribe$/);
  });

  it('decodes a base64url key to bytes', () => {
    expect(Array.from(urlBase64ToUint8Array('AP_-'))).toEqual([0, 255, 254]);
    expect(urlBase64ToUint8Array('SGk')).toEqual(new Uint8Array([72, 105]));
  });

  it('explains why alerts are unavailable', () => {
    const ok = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, standalone: true, isIos: true };
    expect(pushUnavailableReason(ok)).toBeNull();
    expect(pushUnavailableReason({ ...ok, standalone: false })).toMatch(/Home Screen/);
    expect(pushUnavailableReason({ ...ok, isIos: false, standalone: false })).toBeNull();
    expect(pushUnavailableReason({ ...ok, hasPushManager: false, isIos: false })).toMatch(/does not support/);
  });
});
