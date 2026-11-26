/** Token-protected routes for lock-screen rest alerts (milestone 17a). Returns null for other paths. */
import { CORS, isAuthorized, type Env } from './sync';

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });

export async function handlePushRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!(url.pathname.startsWith('/api/push/') || url.pathname === '/api/rest')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!isAuthorized(request, env)) return reply({ error: 'Unauthorized' }, 401);
  if (!env.REST || !env.VAPID_PUBLIC || !env.VAPID_PRIVATE) {
    return reply({ error: 'Lock-screen alerts are not set up on the Worker (VAPID keys and the REST Durable Object). See docs/connector.md.' }, 503);
  }
  if (url.pathname === '/api/push/key' && request.method === 'GET') return reply({ publicKey: env.VAPID_PUBLIC });
  const stub = env.REST.get(env.REST.idFromName('rest'));
  const res = await stub.fetch(request);
  // Same CORS headers as every other route so the app (another origin) can read the answer.
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}
