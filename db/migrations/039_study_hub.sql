-- The study rework: flashcards from your own trades (spaced repetition) and
-- a watch-later list. Additive only.
-- Rollback: db/rollback/039_study_hub.sql (npm run migrate:rollback 039).
CREATE TABLE study_cards (
  trade_id     TEXT PRIMARY KEY,
  interval     INTEGER NOT NULL DEFAULT 0,
  ease         REAL    NOT NULL DEFAULT 2.5,
  reps         INTEGER NOT NULL DEFAULT 0,
  lapses       INTEGER NOT NULL DEFAULT 0,
  -- NULL until first reviewed: a new card.
  due          TEXT,
  introduced   TEXT,
  last_review  TEXT,
  suspended    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX study_cards_due ON study_cards (due);

CREATE TABLE watch_later (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  why         TEXT NOT NULL DEFAULT '',
  added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  done_at     TEXT,
  note_id     TEXT
);
