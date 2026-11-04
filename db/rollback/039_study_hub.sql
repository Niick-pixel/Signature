-- Rolls back 039_study_hub.sql: drops only what it added. Run with
-- `npm run migrate:rollback 039`, the app closed, after a backup.
DROP TABLE IF EXISTS watch_later;
DROP INDEX IF EXISTS study_cards_due;
DROP TABLE IF EXISTS study_cards;
DELETE FROM app_settings WHERE key = 'study_new_per_day';
DELETE FROM schema_migrations WHERE name = '039_study_hub.sql';
