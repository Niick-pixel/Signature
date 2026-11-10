-- Rolls back 043_dashboard_boards.sql: drops only what it added. Run with
-- `npm run migrate:rollback 043`, the app closed, after a backup.
DROP INDEX IF EXISTS dashboard_boards_position;
DROP TABLE IF EXISTS dashboard_boards;
DELETE FROM schema_migrations WHERE name = '043_dashboard_boards.sql';
