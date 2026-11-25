# Claude connector + cloud sync (milestone 10)

Status: 10a done (sync backend). 10b (app sync), 10c (MCP read tools), 10d (propose_program) are next.

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

## Decisions
- Auth: one long secret token, no accounts. The connector will use an unguessable URL carrying a token (confirm in 10c what Claude's custom-connector UI accepts).
- Dependencies added with the user's OK: wrangler, @modelcontextprotocol/sdk, zod (dev dependencies; the Worker is bundled by wrangler).
