-- Rolls back 048_replay_days.sql: drops only what it added. Run with
-- `npm run migrate:rollback 048`, the app closed, after a backup.
DROP TRIGGER IF EXISTS trades_decision_locked_048;
ALTER TABLE trades DROP COLUMN pass_main_reason;
ALTER TABLE trades DROP COLUMN pass_reasons;
ALTER TABLE trades DROP COLUMN row_times;
ALTER TABLE trades DROP COLUMN replay_day_id;
DROP INDEX IF EXISTS idx_replay_days_date;
DROP TABLE IF EXISTS replay_days;
DELETE FROM schema_migrations WHERE name = '048_replay_days.sql';
