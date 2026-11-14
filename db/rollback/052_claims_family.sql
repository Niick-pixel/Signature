-- Rolls back 052_claims_family.sql: the insights table as 037 made it.
-- Retired claims go back to open (what they were before 052); claims made on
-- Rubric v2 since are kept, without their family. Run with
-- `npm run migrate:rollback 052`, the app closed, after a backup.
CREATE TABLE insights_037 (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  scope         TEXT NOT NULL,
  kind          TEXT NOT NULL,
  field         TEXT NOT NULL,
  level         TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('positive', 'negative')),
  size          REAL NOT NULL,
  verdict       TEXT NOT NULL,
  n_at          INTEGER NOT NULL,
  last_trade_at TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'held', 'faded', 'reversed')),
  evaluated_at  TEXT,
  eval_n        INTEGER,
  eval_size     REAL,
  eval_p        REAL
);
INSERT INTO insights_037 (id, created_at, scope, kind, field, level, direction, size, verdict, n_at, last_trade_at, status, evaluated_at, eval_n, eval_size, eval_p)
  SELECT id, created_at, scope, kind, field, level, direction, size, verdict, n_at, last_trade_at,
         CASE WHEN status = 'retired' THEN 'open' ELSE status END,
         CASE WHEN status = 'retired' THEN NULL ELSE evaluated_at END,
         eval_n, eval_size, eval_p
  FROM insights;
DROP TABLE insights;
ALTER TABLE insights_037 RENAME TO insights;
CREATE INDEX insights_scope ON insights (scope, status);
DELETE FROM schema_migrations WHERE name = '052_claims_family.sql';
