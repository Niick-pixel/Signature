-- Rolls back 041_news_figures.sql: drops only what it added. Run with
-- `npm run migrate:rollback 041`, the app closed, after a backup.
ALTER TABLE news_events DROP COLUMN forecast;
ALTER TABLE news_events DROP COLUMN previous;
DELETE FROM schema_migrations WHERE name = '041_news_figures.sql';
