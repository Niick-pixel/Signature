-- The Flaw Deck: working on one flaw at a time. Additive only: two new
-- tables, and two nullable columns on trades that every existing trade
-- reads as "no drill".
-- Rollback: db/rollback/042_flaw_work.sql (npm run migrate:rollback 042).

-- Each drill taken on: active (one at a time), paused, fixed (graduated),
-- relapsed (came back after fixed), or snoozed ("Not now", for 20 trades).
CREATE TABLE flaw_work (
  id            TEXT PRIMARY KEY,
  flaw_key      TEXT NOT NULL,
  drill_text    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('active','paused','fixed','relapsed','snoozed')),
  started_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at      TEXT,
  baseline_rate REAL,
  baseline_n    INTEGER,
  snooze_until  INTEGER
);
CREATE INDEX flaw_work_key ON flaw_work (flaw_key);
-- At most one active drill.
CREATE UNIQUE INDEX flaw_work_one_active ON flaw_work (status) WHERE status = 'active';

-- A drill rewritten on its card, kept per flaw.
CREATE TABLE flaw_drills (
  flaw_key   TEXT PRIMARY KEY,
  drill_text TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- The drill active when a trade was logged, and whether it was kept.
ALTER TABLE trades ADD COLUMN drill_key TEXT;
ALTER TABLE trades ADD COLUMN drill_kept TEXT CHECK (drill_kept IS NULL OR drill_kept IN ('kept','broken','n/a'));
