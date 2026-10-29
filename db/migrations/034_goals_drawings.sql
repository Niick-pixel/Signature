-- Goals with weekly check-ins, and drawings on screenshots. Additive only.

-- A process goal, checked from the journal day by day (or week by week).
-- params is JSON, by kind: { sessions: [] } · { n } · { tag } · { letter } · { minutes }.
CREATE TABLE goals (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('session_only','max_trades','stop_after','same_day','pre_graded','no_tag','min_grade','prep_done','study')),
  title       TEXT NOT NULL,
  params      TEXT NOT NULL DEFAULT '{}',
  start_day   TEXT NOT NULL CHECK (start_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_day     TEXT CHECK (end_day IS NULL OR end_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Once a week, a word on each goal: how it went (1–5) and why.
CREATE TABLE goal_checkins (
  goal_id     TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  week        TEXT NOT NULL CHECK (week GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  rating      INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (goal_id, week)
);

-- Lines, arrows, boxes and words drawn on a screenshot, by its path. JSON:
-- { items: [{ type, ... in 0–1 image coordinates }], r: number | null }.
CREATE TABLE shot_drawings (
  path        TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
