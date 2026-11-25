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

Read-only tools: `get_profile`, `list_exercises`, `list_workouts`, `get_exercise_history` (e1RM with formula and unit), `get_weekly_sets` (hard sets per muscle, primary 1 / secondary 0.5), `get_active_program`, `get_bodyweight`, `get_nutrition` (daily calories and protein with your typed targets), `get_fitness_tests` (academy test events with your target, test date and results). `get_proposals` shows what Claude proposed before and what you decided.

## Proposals from Claude (10d)
The one write tool is `propose_program`. It validates the program with the same rules as the app (and checks every exercise name exists in your library), then stores a proposal with status `proposed`. It cannot create or change programs, workouts or any other data, and at most 5 proposals can wait at once. In the app: Coach → Program from Claude → Proposals waiting (tap Check for proposals to sync first), then Review to see the diff, and Approve or Reject. Approving uses the normal flow (new version of the active program, or a separate draft). Your decision syncs back, so Claude can see it with `get_proposals`. Dates and weeks use UTC, so a late-evening workout can show on the next day. Data is only as fresh as your last Sync now in the app.

## Decisions
- Auth: one long secret token, no accounts. App sync uses a Bearer header; the connector uses the token in the URL path (`/mcp/<token>`, Bearer also accepted). Not yet tried in the real Claude connector screen.
- Dependencies added with the user's OK: wrangler, @modelcontextprotocol/sdk, zod (dev dependencies; the Worker is bundled by wrangler).

## Updating the Worker
Whenever the app gains new data (nutrition was added after the first deploy), redeploy the Worker so it accepts it: open the `worker` folder and run `npx wrangler deploy`. Until then, Settings shows "Your Worker is out of date" and syncing pauses; nothing is lost, and the next sync after the redeploy sends everything.

## Sync happens by itself
Once sync is set up, the app syncs a few seconds after any change, when it returns to the foreground, when the network comes back, and every 5 minutes while open. "Sync now" in Settings → Claude is only needed to force it. Proposals from Claude show up as a notice on Home and under Settings → Claude.
