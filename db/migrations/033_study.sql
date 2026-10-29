-- The study room. Additive only: four new tables.

-- A note, a written playbook, or notes on a video. Playbooks here are the
-- guide in words (the Judas swing, step by step); the playbooks table keeps
-- the named setups the stats count. Bodies are plain text.
CREATE TABLE study_notes (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','playbook','video')),
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  -- A video's link (opens in the browser, outside the app).
  url         TEXT,
  -- JSON array of short tags.
  tags        TEXT NOT NULL DEFAULT '[]',
  pinned      INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Example trades for a note: the A+ version, the one that failed.
CREATE TABLE study_note_trades (
  note_id   TEXT NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
  trade_id  TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'example' CHECK (role IN ('example','counter')),
  added_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (note_id, trade_id)
);

-- A moment in a video worth coming back to.
CREATE TABLE video_marks (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
  seconds     INTEGER NOT NULL CHECK (seconds >= 0),
  text        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX video_marks_note ON video_marks(note_id, seconds);

-- Time spent studying, from the study timer. `day` is the local day it ended on.
CREATE TABLE study_sessions (
  id          TEXT PRIMARY KEY,
  day         TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  minutes     REAL NOT NULL CHECK (minutes > 0),
  note_id     TEXT REFERENCES study_notes(id) ON DELETE SET NULL,
  topic       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX study_sessions_day ON study_sessions(day);
