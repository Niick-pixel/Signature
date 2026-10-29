-- Your own tag groups (Reports → Tags): categories you name — "Entry model",
-- "Market condition", "Emotion" — each with its own tags, put on trades.
-- Additive only; the built-in mistake and confluence tags are untouched.

CREATE TABLE tag_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  ordinal     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE custom_tags (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES tag_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  ordinal     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- A tag on a trade. Trades are soft-deleted, so no foreign key to them: a
-- restored trade keeps its tags.
CREATE TABLE trade_custom_tags (
  trade_id    TEXT NOT NULL,
  tag_id      TEXT NOT NULL REFERENCES custom_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);
CREATE INDEX trade_custom_tags_tag ON trade_custom_tags (tag_id);
