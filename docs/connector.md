# Claude connector + cloud sync (milestone 10)

Status: 10a (sync backend), 10b (app sync), 10c (MCP read tools) and 10d (propose_program) done. Milestone 10 is code complete; it still needs the real-device check.

## What it is
One Cloudflare Worker (`worker/`) with a D1 database in your own free Cloudflare account. Forge pushes and pulls changed rows; later the same Worker exposes an MCP server so the Claude app can read your training data. Photos, the undo stack and raw import rows stay on the device.

Privacy: a full copy of your training data lives in your own Cloudflare account once sync is on.

## Sync API (10a)
All `/api/sync/*` calls need `Authorization: Bearer <SYNC_TOKEN>`. `GET /api/health` is open.
- `POST /api/sync/push` body `{ rows: [{ table, row }] }`, max 200 rows. Each row needs `id`, `createdAt`, `updatedAt` (ISO). Last writer wins by `updatedAt`; ties keep the stored row. Response `{ accepted, skipped, cursor }`. One invalid row rejects the whole push (400).
- `GET /api/sync/pull?since=<cursor>&limit=<n>` returns `{ rows: [{ table, row, seq }], cursor, more }` in change order, max 500 per page. Keep pulling while `more` is true, then store `cursor`.
- Deletes are soft deletes (`deletedAt`), synced like any row.

## Deploy (one time, from a computer with Node 20+)
Run everything from the `worker` folder of the repo (after `npm install` in the repo root).
1. `cd worker`
2. `npx wrangler login` (opens a browser; sign in to Cloudflare)
3. `npx wrangler d1 create forge`, then paste the `database_id` it prints into `wrangler.toml`.
4. `npx wrangler d1 execute forge --remote --file=schema.sql`
5. `npx wrangler secret put SYNC_TOKEN` and paste a long random string (at least 16 characters; the Worker refuses shorter ones). Make one with `openssl rand -base64 32`.
6. `npx wrangler deploy` and note the `*.workers.dev` URL.
7. Check: open `https://<worker-url>/api/health` in a browser. It should show `{"ok":true}`.

Keep the token private. If it leaks, run step 5 again with a new value.

## Connect Claude (10c)
After deploying and syncing from the app at least once:
1. In Claude (web or app): Settings → Connectors → Add custom connector.
2. Name: Forge. URL: `https://<worker-url>/mcp/<SYNC_TOKEN>` (the token is part of the URL; treat the URL like a password).
3. No sign-in is needed. Ask Claude something like "Look at my last 4 weeks of training in Forge".
If the connector screen refuses the URL, tell me what it says; the fallback is OAuth, which is a bigger change.

Read-only tools: `get_profile`, `list_exercises`, `list_workouts`, `get_exercise_history` (e1RM with formula and unit), `get_weekly_sets` (hard sets per muscle, primary 1 / secondary 0.5), `get_active_program`, `get_bodyweight`, `get_nutrition` (daily calories and protein with your typed targets), `get_readiness` (daily sleep, soreness and energy check-ins with a 1–5 score and averages), `get_fitness_tests` (academy test events with your target, test date and results). `get_proposals` shows what Claude proposed before and what you decided.

## Proposals from Claude (10d)
The one write tool is `propose_program`. It validates the program with the same rules as the app (and checks every exercise name exists in your library), then stores a proposal with status `proposed`. It cannot create or change programs, workouts or any other data, and at most 5 proposals can wait at once. In the app: Coach → Program from Claude → Proposals waiting (tap Check for proposals to sync first), then Review to see the diff, and Approve or Reject. Approving uses the normal flow (new version of the active program, or a separate draft). Your decision syncs back, so Claude can see it with `get_proposals`. Dates and weeks use UTC, so a late-evening workout can show on the next day. Data is only as fresh as your last Sync now in the app.

## Lock-screen rest alerts (milestone 17)
**Before every redeploy, update your copy first.** In the FORGE folder run `git pull` (or download the latest `main`), otherwise `npx wrangler deploy` uploads the old Worker again. If `git pull` complains that `worker/wrangler.toml` has local changes (your `database_id`), run `git stash`, `git pull`, `git stash pop`, and keep your `database_id` line if asked to resolve a conflict.

Check which version is live: open `https://<your-worker>/api/health` in a browser. An up-to-date Worker answers `{"ok":true,"features":["sync","mcp","nutrition","push","readiness","weekly"]}`. A plain `{"ok":true}` means the old code is still deployed. If the app says "The Worker answered 404" or "Your Worker is an older version", it is the same problem.

Makes the rest timer notify you with Forge closed or the phone locked, using Web Push sent by your own Worker. One-time setup, from the repo root unless noted:
1. `node scripts/vapid-keys.mjs` prints a key pair and the two commands to store it.
2. In `worker/`: `npx wrangler secret put VAPID_PUBLIC` and `npx wrangler secret put VAPID_PRIVATE`, pasting the printed values. Keep the private value out of the repo and chat.
3. Optional: add `[vars]` `VAPID_SUBJECT = "mailto:you@example.com"` to `wrangler.toml` (push services may use it to contact you); by default the Worker's own address is used.
4. `npx wrangler deploy` in `worker/`. The first deploy after this change also creates the `RestAlarm` Durable Object (SQLite-backed, on the free plan) through the `[[migrations]]` block.
5. On the iPhone: Forge must be installed on the Home Screen (iOS 16.4 or later). Open it from there, Settings → Lock-screen rest alerts → On, allow notifications, then "Test: alert in 10 seconds" and lock the phone.
Routes (all need the Bearer token): `GET /api/push/key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`, `PUT /api/rest {endsAt}`, `DELETE /api/rest`. The Worker sends an empty push at `endsAt`; the service worker shows "Rest over". iPhone plays its standard notification sound; a custom bell is not possible. If the phone reports the subscription gone (404/410), the Worker forgets it and you turn the setting off and on again.

## Weekly email (Sunday summary)
Every Sunday evening (US time; the cron is Monday 01:00 UTC) the Worker emails a summary of Monday to Sunday: sessions, working sets and volume, PRs, nutrition averages against your targets, readiness, and the next sessions of your active program. Warm-ups are excluded. It uses Resend's free plan (3,000 emails a month; this sends about four).
1. Sign up at resend.com with the address you want the email at, then create an API key (API Keys → Create, "Sending access").
2. In `worker/`: `npx wrangler secret put RESEND_API_KEY` (paste the key) and `npx wrangler secret put EMAIL_TO` (your sign-up address).
3. `git pull` in the FORGE folder, then `npx wrangler deploy` in `worker/`. The deploy registers the cron from `[triggers]` in `wrangler.toml`.
4. Check it: `curl -H "Authorization: Bearer <sync token>" https://<your-worker>/api/weekly` prints this week's text. `curl -X POST -H "Authorization: Bearer <sync token>" https://<your-worker>/api/weekly/send` sends it now.
Without your own domain, Resend sends from `onboarding@resend.dev` and only to the address you signed up with, which is all Forge needs. To send from your own domain later, verify it in Resend and set `EMAIL_FROM` (for example `[vars] EMAIL_FROM = "Forge <forge@yourdomain.com>"`). Without the two secrets the cron does nothing. The data comes from the cloud copy, so it is as fresh as your last sync.

## Decisions
- Auth: one long secret token, no accounts. App sync uses a Bearer header; the connector uses the token in the URL path (`/mcp/<token>`, Bearer also accepted). Not yet tried in the real Claude connector screen.
- Dependencies added with the user's OK: wrangler, @modelcontextprotocol/sdk, zod (dev dependencies; the Worker is bundled by wrangler).

## Updating the Worker
Whenever the app gains new data (nutrition was added after the first deploy), redeploy the Worker so it accepts it: open the `worker` folder and run `npx wrangler deploy`. Until then, Settings shows "Your Worker is out of date" and syncing pauses; nothing is lost, and the next sync after the redeploy sends everything.

## Sync happens by itself
Once sync is set up, the app syncs a few seconds after any change, when it returns to the foreground, when the network comes back, and every 5 minutes while open. "Sync now" in Settings → Claude is only needed to force it. Proposals from Claude show up as a notice on Home and under Settings → Claude.
