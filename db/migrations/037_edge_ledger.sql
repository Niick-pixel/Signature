-- The Edge Engine's own tables (milestones 9 and 10). Additive only.
-- Rollback: db/rollback/037_edge_ledger.sql (npm run migrate:rollback 037).

-- Your words for each mistake theme, on top of the built-in ones: "didn't
-- wait", "fomo", "jumped in". Matched in lessons with stemming and negation.
CREATE TABLE theme_dictionary (
  id          TEXT PRIMARY KEY,
  theme       TEXT NOT NULL,
  phrase      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX theme_dictionary_phrase ON theme_dictionary (theme, phrase);

-- The insight ledger: every claim the engine showed above Too early, kept so
-- it can be re-checked on trades logged after it was made.
CREATE TABLE insights (
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
  -- The newest trade the claim had seen: the test set is everything after it.
  last_trade_at TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'held', 'faded', 'reversed')),
  evaluated_at  TEXT,
  eval_n        INTEGER,
  eval_size     REAL,
  eval_p        REAL
);
CREATE INDEX insights_scope ON insights (scope, status);

-- Blind Re-grade: every grade given blind, so the same setup graded twice
-- weeks apart can be compared (test–retest).
CREATE TABLE blind_grades (
  id          TEXT PRIMARY KEY,
  trade_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  grade       TEXT NOT NULL,
  score       INTEGER
);
CREATE INDEX blind_grades_trade ON blind_grades (trade_id);
