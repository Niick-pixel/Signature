-- The Stats dashboard: boards of widgets. Additive only: one new table.
-- Rollback: db/rollback/043_dashboard_boards.sql (npm run migrate:rollback 043).

-- One row per board (Overview, Flaws, … and your own). layout_json is the
-- grid of widgets and stacks; settings_json the board's look. Both carry
-- schema_version, so a saved board is migrated (lib/dashboard/schema.ts),
-- never broken, when a widget is renamed or a field added.
CREATE TABLE dashboard_boards (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  position       INTEGER NOT NULL DEFAULT 0,
  layout_json    TEXT NOT NULL,
  settings_json  TEXT NOT NULL DEFAULT '{}',
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX dashboard_boards_position ON dashboard_boards (position);
