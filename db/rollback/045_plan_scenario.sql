-- Rolls back 045_plan_scenario.sql: drops only what it added. Run with
-- `npm run migrate:rollback 045`, the app closed, after a backup.
ALTER TABLE trades DROP COLUMN plan_scenario;
DELETE FROM schema_migrations WHERE name = '045_plan_scenario.sql';
