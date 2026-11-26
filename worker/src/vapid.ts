/**
 * VAPID (RFC 8292) for Web Push: an ES256 JWT proving the push came from our server.
 * Payload-less pushes need no message encryption (RFC 8291), so this is all the crypto required.
 * Keys are base64url: the public key is the 65-byte uncompressed P-256 point, the private key the 32-byte scalar.
 */

export function b64uEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const utf8 = (s: string) => new TextEncoder().encode(s);

export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return { publicKey: b64uEncode(raw), privateKey: jwk.d! };
}

export async function importVapidPrivateKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = b64uDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: privateKey, ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Origin of a push endpoint: the JWT `aud` claim. */
export function audienceOf(endpoint: string): string {
  return new URL(endpoint).origin;
}

export interface VapidClaims {
  audience: string;
  /** mailto: or https: contact for the push service. */
  subject: string;
  nowSec: number;
  /** Lifetime in seconds; push services cap it at 24 h. */
  ttlSec?: number;
}

export async function vapidJwt(key: CryptoKey, c: VapidClaims): Promise<string> {
  const header = b64uEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(utf8(JSON.stringify({ aud: c.audience, exp: c.nowSec + (c.ttlSec ?? 12 * 3600), sub: c.subject })));
  const input = `${header}.${claims}`;
  // WebCrypto returns ECDSA as raw r||s (64 bytes), which is the JWS format already.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(input)));
  return `${input}.${b64uEncode(sig)}`;
}

/** Value of the Authorization header for a push request. */
export async function vapidAuthorization(key: CryptoKey, publicKey: string, c: VapidClaims): Promise<string> {
  return `vapid t=${await vapidJwt(key, c)}, k=${publicKey}`;
}
