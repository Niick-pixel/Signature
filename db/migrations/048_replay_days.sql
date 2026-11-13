-- Replay plans for backtests, and three Step 1 / Step 2 additions for rubric v2.
-- Additive: one new table, four nullable columns on trades, one trigger.
-- Existing trades are untouched (every new column is NULL on them).
-- Rollback: db/rollback/048_replay_days.sql.

-- A replay day: the plan built before replaying one session date in FX Replay.
-- Numbered within a sitting (Day 1, 2, 3…), dated with the date replayed.
CREATE TABLE replay_days (
  id           TEXT PRIMARY KEY,
  sitting_id   TEXT NOT NULL,
  sequence     INTEGER NOT NULL CHECK (sequence >= 1),
  replay_date  TEXT NOT NULL,                 -- YYYY-MM-DD, the day being replayed
  weekday      TEXT CHECK (weekday IS NULL OR weekday IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri')),
  instrument   TEXT,
  -- The plan as locked: JSON (lib/replay ReplayContext, ReplayScenarios). Never rewritten.
  context      TEXT NOT NULL,
  scenarios    TEXT NOT NULL,
  locked_at    TEXT,
  -- An amendment after locking: kept beside the original, which stays what trades and Stats read.
  amended_at        TEXT,
  amended_context   TEXT,
  amended_scenarios TEXT,
  -- Closing the day: what played out, and whether each scenario that played was taken.
  outcome      TEXT CHECK (outcome IS NULL OR outcome IN ('A', 'B', 'C', 'unplanned', 'both')),
  took_a       TEXT CHECK (took_a IS NULL OR took_a IN ('yes', 'passed', 'missed')),
  took_b       TEXT CHECK (took_b IS NULL OR took_b IN ('yes', 'passed', 'missed')),
  closed_at    TEXT,
  ends_sitting INTEGER NOT NULL DEFAULT 0 CHECK (ends_sitting IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (sitting_id, sequence)
);
CREATE INDEX idx_replay_days_date ON replay_days (replay_date);

-- Which replay day a backtest was traded on (NULL: not a replay-plan trade).
ALTER TABLE trades ADD COLUMN replay_day_id TEXT REFERENCES replay_days (id) ON DELETE SET NULL;
-- Step 1: when each rubric row and the gate were last scored, in seconds since the form opened (JSON).
ALTER TABLE trades ADD COLUMN row_times TEXT;
-- Step 2 for a pass or a miss: why (JSON array), and the main reason.
ALTER TABLE trades ADD COLUMN pass_reasons TEXT;
ALTER TABLE trades ADD COLUMN pass_main_reason TEXT;

-- The timings are part of Step 1: locked with it.
CREATE TRIGGER trades_decision_locked_048
BEFORE UPDATE OF row_times
ON trades
WHEN OLD.decided_at IS NOT NULL AND NEW.row_times IS NOT OLD.row_times
BEGIN
  SELECT RAISE(ABORT, 'Step 1 is locked: the decision and its grade cannot be edited. Use the honest re-grade.');
END;
