-- The cockpit's nudges, logged (big update, batch B). Rollback: db/rollback/054_nudge_log.sql.
--
-- Each nudge is written once a day, the first time it shows (a stop after N losses, a re-entry after
-- a loss, a red folder close…), so later it can be read whether a nudge changed anything: was there a
-- trade after the day's stop? Nothing is ever blocked; this only records what was said, and when.
CREATE TABLE nudge_log (
  day       TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  key       TEXT NOT NULL,
  kind      TEXT NOT NULL,
  level     TEXT NOT NULL CHECK (level IN ('stop', 'warn', 'note')),
  text      TEXT NOT NULL,
  first_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (day, key)
);
CREATE TRIGGER dv_nudge_log_insert AFTER INSERT ON nudge_log BEGIN UPDATE data_version SET v = v + 1 WHERE id = 1; END;
CREATE TRIGGER dv_nudge_log_update AFTER UPDATE ON nudge_log BEGIN UPDATE data_version SET v = v + 1 WHERE id = 1; END;
CREATE TRIGGER dv_nudge_log_delete AFTER DELETE ON nudge_log BEGIN UPDATE data_version SET v = v + 1 WHERE id = 1; END;
