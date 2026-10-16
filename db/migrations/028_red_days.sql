-- Red days and their pages. A day that ends net negative asks for a page —
-- what I saw, what I did, the rule, one if-then for next time. This links
-- each red day to the page written for it, so the Path can count red days
-- with a page and without. world: 'real' (Demo, Live, Eval, Funded) or
-- 'backtest' (grouped by the replayed chart date).
CREATE TABLE red_day_pages (
  day        TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  world      TEXT NOT NULL CHECK (world IN ('real','backtest')),
  page_id    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (day, world)
);
