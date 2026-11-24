-- Rollback of 054_nudge_log.sql: the nudge log goes (only what the cockpit said, never a trade).
DROP TRIGGER IF EXISTS dv_nudge_log_insert;
DROP TRIGGER IF EXISTS dv_nudge_log_update;
DROP TRIGGER IF EXISTS dv_nudge_log_delete;
DROP TABLE IF EXISTS nudge_log;
