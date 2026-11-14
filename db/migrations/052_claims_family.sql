-- Rubric families in the insight ledger (Stats Pass 1). Rollback: db/rollback/052_claims_family.sql.
--
-- Every claim now records the rubric family it was made on ('v2' or 'legacy'),
-- and a claim can be closed as 'retired': the legacy checklist rubric is frozen
-- (no new trade is graded under it), so an open claim about it can never be
-- re-checked. Retired claims stay listed in Engine health; they are left out of
-- the hit rate and of the thresholds.
--
-- Every claim made before this migration was made on legacy-rubric data (or
-- legacy and v2 pooled together, which is what this pass ends): each is
-- recorded as 'legacy', and the open ones are closed as retired.
--
-- SQLite cannot change a CHECK in place, so the table is rebuilt, every row
-- copied 1:1 (no foreign key points at insights).
CREATE TABLE insights_052 (
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
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'held', 'faded', 'reversed', 'retired')),
  evaluated_at  TEXT,
  eval_n        INTEGER,
  eval_size     REAL,
  eval_p        REAL,
  family        TEXT NOT NULL DEFAULT 'legacy' CHECK (family IN ('legacy', 'v2'))
);
INSERT INTO insights_052 (id, created_at, scope, kind, field, level, direction, size, verdict, n_at, last_trade_at, status, evaluated_at, eval_n, eval_size, eval_p, family)
  SELECT id, created_at, scope, kind, field, level, direction, size, verdict, n_at, last_trade_at,
         CASE WHEN status = 'open' THEN 'retired' ELSE status END,
         CASE WHEN status = 'open' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE evaluated_at END,
         eval_n, eval_size, eval_p, 'legacy'
  FROM insights;
DROP TABLE insights;
ALTER TABLE insights_052 RENAME TO insights;
CREATE INDEX insights_scope ON insights (scope, status);
