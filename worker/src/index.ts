import { handleMcp, loadData } from './mcp';
import { handlePushRoutes } from './pushRoutes';
import { handleRequest, isAuthorized, type Env } from './sync';
import { buildWeeklyReport, reportDate, sendWeeklyEmail } from './weekly';

export { RestAlarm } from './restAlarm';

/** GET /api/weekly previews this week's email (text); POST /api/weekly/send sends it now. Both need the sync token. */
export async function handleWeekly(request: Request, env: Env): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname !== '/api/weekly' && pathname !== '/api/weekly/send') return null;
  if (!isAuthorized(request, env)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  const report = buildWeeklyReport(await loadData(env.DB), reportDate(new Date()));
  if (pathname === '/api/weekly') return new Response(report.text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (request.method !== 'POST') return new Response('Use POST', { status: 405 });
  const out = await sendWeeklyEmail(env, report);
  return new Response(JSON.stringify(out), { status: out.sent ? 200 : 503, headers: { 'content-type': 'application/json' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await handleMcp(request, env)) ?? (await handleWeekly(request, env)) ?? (await handlePushRoutes(request, env)) ?? handleRequest(request, env);
  },
  /** Cron (wrangler.toml [triggers]): the Sunday summary email. */
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    ctx.waitUntil(
      (async () => {
        if (!env.RESEND_API_KEY || !env.EMAIL_TO) return;
        const out = await sendWeeklyEmail(env, buildWeeklyReport(await loadData(env.DB), reportDate(new Date())));
        if (!out.sent) console.log('weekly email not sent:', out.reason);
      })(),
    );
  },
};
