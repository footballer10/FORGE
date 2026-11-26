import { describe, expect, it } from 'vitest';
import { decodeConnection, encodeConnection } from './connection';

describe('connection code', () => {
  const c = { url: 'https://forge-sync.example.workers.dev', token: 'a-long-secret-token+/=with-symbols' };
  it('round-trips the URL and token, ignoring whitespace', () => {
    const code = encodeConnection(c);
    expect(code.startsWith('forge1:')).toBe(true);
    expect(decodeConnection(code)).toEqual(c);
    expect(decodeConnection(`  ${code.slice(0, 10)}\n${code.slice(10)} `)).toEqual(c);
  });
  it('rejects anything else', () => {
    expect(decodeConnection('hello')).toBeUndefined();
    expect(decodeConnection('forge1:!!!')).toBeUndefined();
    expect(decodeConnection(encodeConnection({ url: 'http://insecure', token: c.token }))).toBeUndefined();
    expect(decodeConnection(encodeConnection({ url: c.url, token: 'short' }))).toBeUndefined();
  });
});
