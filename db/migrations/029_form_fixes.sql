-- New Trade form fixes. Additive only: every column is new and empty on
-- every existing trade, and nothing already stored changes meaning.

-- R to the nearest liquidity, as a quick bucket instead of three prices.
-- Under 1.5R (or 2+ opposing swings) the target check fails.
ALTER TABLE trades ADD COLUMN r_to_nearest_bucket TEXT
  CHECK (r_to_nearest_bucket IS NULL OR r_to_nearest_bucket IN ('<1','1-1.5','1.5-2','2+'));

-- The management plan, as one choice that also names the breakeven trigger
-- (be_trigger is derived from it on save). mgmt_plan ('A'/'B') stays as it
-- was on the trades that carry it.
ALTER TABLE trades ADD COLUMN management TEXT
  CHECK (management IS NULL OR management IN
    ('Hold to stop or target','BE at 1R','BE on structure break','Partial at 1R, runner','Other'));

-- Red days skipped on purpose: never asked about again, counted apart.
CREATE TABLE red_day_skips (
  day        TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  world      TEXT NOT NULL CHECK (world IN ('real','backtest')),
  skipped_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (day, world)
);

-- Red days count from the day this arrived: no page is asked for a day that
-- was already history when the prompt existed.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('red_days_since', date('now','localtime'));
