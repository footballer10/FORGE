/**
 * Connection code: the Worker URL and sync token in one pasteable string, so a fresh install (after the
 * app was removed from the Home Screen, which deletes its data) can reconnect and pull everything back.
 * It is as sensitive as the token itself.
 */
const PREFIX = 'forge1:';

export interface Connection {
  url: string;
  token: string;
}

const toB64Url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

export function encodeConnection(c: Connection): string {
  return PREFIX + toB64Url(JSON.stringify({ u: c.url, t: c.token }));
}

/** Reads a code (spaces and line breaks ignored). Undefined if it is not a valid Forge code. */
export function decodeConnection(code: string): Connection | undefined {
  const s = code.replace(/\s+/g, '');
  if (!s.startsWith(PREFIX)) return undefined;
  try {
    const o = JSON.parse(fromB64Url(s.slice(PREFIX.length))) as { u?: unknown; t?: unknown };
    if (typeof o.u !== 'string' || typeof o.t !== 'string' || !/^https:\/\//.test(o.u) || o.t.length < 16) return undefined;
    return { url: o.u, token: o.t };
  } catch {
    return undefined;
  }
}
