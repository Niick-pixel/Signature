-- Economic news, entered by hand or imported from a calendar file
-- (ForexFactory CSV, any .ics). Additive only: one new table.
-- `at` is on the journal clock, like trades.date. A high-impact event in a
-- counted currency makes its day a red-folder day for the rules, alongside
-- the morning check-in's own answer.
CREATE TABLE news_events (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL CHECK (at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]'),
  -- An all-day item (a holiday, "tentative") has no time worth trusting.
  all_day     INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0,1)),
  currency    TEXT NOT NULL DEFAULT 'USD',
  title       TEXT NOT NULL,
  impact      TEXT NOT NULL DEFAULT 'High' CHECK (impact IN ('High','Medium','Low','Holiday')),
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (at, currency, title)
);
CREATE INDEX news_events_at ON news_events(at);

-- Which currencies count, and whether their high-impact events mark the day red.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('news_currencies', 'USD');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('news_marks_red', '1');
