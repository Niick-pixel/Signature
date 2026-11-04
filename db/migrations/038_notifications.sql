-- The bell: every reminder the app has raised, once each (the id says what it
-- is about: "prep:2026-11-04", "news:<event>"). Additive only.
-- Rollback: db/rollback/038_notifications.sql (npm run migrate:rollback 038).
CREATE TABLE notifications (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL DEFAULT '',
  route          TEXT NOT NULL DEFAULT '/dashboard',
  urgent         INTEGER NOT NULL DEFAULT 0,
  silent         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at        TEXT,
  snoozed_until  TEXT,
  resolved_at    TEXT,
  dismissed_at   TEXT
);
CREATE INDEX notifications_created ON notifications (created_at);
