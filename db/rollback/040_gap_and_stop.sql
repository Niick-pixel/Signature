-- Rolls back 040_gap_and_stop.sql: drops only what it added. Run with
-- `npm run migrate:rollback 040`, the app closed, after a backup.
ALTER TABLE trades DROP COLUMN opposing_htf_gap;
ALTER TABLE trades DROP COLUMN stop_placement;
DELETE FROM app_settings WHERE key = 'backtest_stop_rule';
DELETE FROM schema_migrations WHERE name = '040_gap_and_stop.sql';
