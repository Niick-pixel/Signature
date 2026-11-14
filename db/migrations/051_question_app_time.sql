-- The daily question (Study) and time in the app. Additive only: two tables.
-- Rollback: db/rollback/051_question_app_time.sql.

-- One hard question a day (lib/dailyQuestion), answered once: which option, and whether it was right.
CREATE TABLE daily_answers (
  day          TEXT PRIMARY KEY CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  question_id  TEXT NOT NULL,
  choice       INTEGER NOT NULL CHECK (choice BETWEEN 0 AND 3),
  correct      INTEGER NOT NULL CHECK (correct IN (0,1)),
  answered_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Seconds the app was in use, per local day: focused, or full screen on a monitor, and not idle.
-- A day with no study session logged by hand counts this as its study time (db/appTime).
CREATE TABLE app_time (
  day         TEXT PRIMARY KEY CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  seconds     REAL NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
