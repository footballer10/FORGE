-- Forge sync store (Cloudflare D1). Apply with: npx wrangler d1 execute forge --remote --file=worker/schema.sql
-- One generic row table: every synced Dexie row is stored as JSON, keyed by (table_name, id).
-- `seq` is a server-side change counter; clients pull "everything with seq > my cursor".
CREATE TABLE IF NOT EXISTS rows (
  table_name TEXT NOT NULL,
  id         TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  data       TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  PRIMARY KEY (table_name, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS rows_seq ON rows (seq);
CREATE INDEX IF NOT EXISTS rows_table_updated ON rows (table_name, updated_at);
