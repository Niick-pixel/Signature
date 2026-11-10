-- Rolls back 042_flaw_work.sql: drops only what it added. Run with
-- `npm run migrate:rollback 042`, the app closed, after a backup.
DROP INDEX IF EXISTS flaw_work_one_active;
DROP INDEX IF EXISTS flaw_work_key;
DROP TABLE IF EXISTS flaw_work;
DROP TABLE IF EXISTS flaw_drills;
ALTER TABLE trades DROP COLUMN drill_key;
ALTER TABLE trades DROP COLUMN drill_kept;
DELETE FROM schema_migrations WHERE name = '042_flaw_work.sql';
