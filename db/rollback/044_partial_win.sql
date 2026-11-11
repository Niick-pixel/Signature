-- Rolls back 044_partial_win.sql: drops only what it added. Run with
-- `npm run migrate:rollback 044`, the app closed, after a backup.
ALTER TABLE trades DROP COLUMN partial_win;
DELETE FROM schema_migrations WHERE name = '044_partial_win.sql';
