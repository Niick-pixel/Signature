-- Rolls back 038_notifications.sql: drops only what it added. Run with
-- `npm run migrate:rollback 038`, the app closed, after a backup.
DROP INDEX IF EXISTS notifications_created;
DROP TABLE IF EXISTS notifications;
DELETE FROM app_settings WHERE key = 'notify';
DELETE FROM schema_migrations WHERE name = '038_notifications.sql';
