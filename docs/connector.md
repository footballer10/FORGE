# Claude connector + cloud sync (milestone 10)

Status: 10a (sync backend), 10b (app sync) and 10c (MCP read tools) done. 10d (propose_program) is next.

## What it is
One Cloudflare Worker (`worker/`) with a D1 database in your own free Cloudflare account. Forge pushes and pulls changed rows; later the same Worker exposes an MCP server so the Claude app can read your training data. Photos, the undo stack and raw import rows stay on the device.

Privacy: a full copy of your training data lives in your own Cloudflare account once sync is on.

## Sync API (10a)
All `/api/sync/*` calls need `Authorization: Bearer <SYNC_TOKEN>`. `GET /api/health` is open.
- `POST /api/sync/push` body `{ rows: [{ table, row }] }`, max 200 rows. Each row needs `id`, `createdAt`, `updatedAt` (ISO). Last writer wins by `updatedAt`; ties keep the stored row. Response `{ accepted, skipped, cursor }`. One invalid row rejects the whole push (400).
- `GET /api/sync/pull?since=<cursor>&limit=<n>` returns `{ rows: [{ table, row, seq }], cursor, more }` in change order, max 500 per page. Keep pulling while `more` is true, then store `cursor`.
- Deletes are soft deletes (`deletedAt`), synced like any row.

## Deploy (one time, from a computer with Node)
1. `npx wrangler login`
2. `npx wrangler d1 create forge` and paste the `database_id` into `worker/wrangler.toml`.
3. `npx wrangler d1 execute forge --remote --file=worker/schema.sql`
4. `cd worker && npx wrangler secret put SYNC_TOKEN` (a long random string, at least 16 characters; the Worker refuses shorter ones). Generate one with `openssl rand -base64 32`.
5. `cd worker && npx wrangler deploy` and note the `*.workers.dev` URL.
6. Check: `curl https://<worker-url>/api/health` returns `{"ok":true}`.

Keep the token private. If it leaks, run step 4 again with a new value.

## Connect Claude (10c)
After deploying and syncing from the app at least once:
1. In Claude (web or app): Settings → Connectors → Add custom connector.
2. Name: Forge. URL: `https://<worker-url>/mcp/<SYNC_TOKEN>` (the token is part of the URL; treat the URL like a password).
3. No sign-in is needed. Ask Claude something like "Look at my last 4 weeks of training in Forge".
If the connector screen refuses the URL, tell me what it says; the fallback is OAuth, which is a bigger change.

Read-only tools: `get_profile`, `list_exercises`, `list_workouts`, `get_exercise_history` (e1RM with formula and unit), `get_weekly_sets` (hard sets per muscle, primary 1 / secondary 0.5), `get_active_program`, `get_bodyweight`. There are no write tools yet. Dates and weeks use UTC, so a late-evening workout can show on the next day. Data is only as fresh as your last Sync now in the app.

## Decisions
- Auth: one long secret token, no accounts. App sync uses a Bearer header; the connector uses the token in the URL path (`/mcp/<token>`, Bearer also accepted). Not yet tried in the real Claude connector screen.
- Dependencies added with the user's OK: wrangler, @modelcontextprotocol/sdk, zod (dev dependencies; the Worker is bundled by wrangler).
