-- New Trade guardrails (Phase 2). Every column is new and empty on every
-- existing trade, so old trades read, grade and export exactly as before.

-- When the grade was locked. Set the first time a trade is saved Planned or
-- Live (a backtest's "Lock grade"), or at its first save otherwise. With
-- graded_post_hoc = 0 it means the grade existed before the outcome did.
ALTER TABLE trades ADD COLUMN grade_locked_at TEXT;

-- The session being replayed, for a backtest: logs happen at night, so the
-- log time is not the market day. Per-day rules and stats use it when set.
ALTER TABLE trades ADD COLUMN chart_date TEXT
  CHECK (chart_date IS NULL OR chart_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

-- Target check: the nearest clear liquidity in my direction inside the
-- current dealing range, the swings in the way, and the R it is worth.
ALTER TABLE trades ADD COLUMN nearest_liquidity_type TEXT;
ALTER TABLE trades ADD COLUMN nearest_liquidity_price REAL;
ALTER TABLE trades ADD COLUMN opposing_swings_between TEXT
  CHECK (opposing_swings_between IS NULL OR opposing_swings_between IN ('0','1','2+'));
ALTER TABLE trades ADD COLUMN r_to_nearest REAL;
ALTER TABLE trades ADD COLUMN target_check_passed INTEGER
  CHECK (target_check_passed IS NULL OR target_check_passed IN (0,1));
-- EQH/EQL by definition: { touches, untested, in_range } — each true/false.
ALTER TABLE trades ADD COLUMN eqhl_checks TEXT CHECK (eqhl_checks IS NULL OR json_valid(eqhl_checks));

-- What moves the stop to breakeven, decided before the trade.
ALTER TABLE trades ADD COLUMN be_trigger TEXT
  CHECK (be_trigger IS NULL OR be_trigger IN ('1R','Structure break','None'));

-- Taken below my minimum confidence (a no-trade by my rules). Set by the
-- server on new trades only; counts as a rule break in derived adherence.
ALTER TABLE trades ADD COLUMN below_min_confidence INTEGER
  CHECK (below_min_confidence IS NULL OR below_min_confidence IN (0,1));

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('min_confidence', '3'),
  ('fallback_stop_after_losses', '2');
