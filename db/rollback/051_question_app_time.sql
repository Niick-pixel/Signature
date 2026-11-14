-- Rolls back 051_question_app_time.sql: drops the two tables it added.
-- Run with `npm run migrate:rollback 051`, the app closed, after a backup.
DROP TABLE IF EXISTS app_time;
DROP TABLE IF EXISTS daily_answers;
DELETE FROM schema_migrations WHERE name = '051_question_app_time.sql';
