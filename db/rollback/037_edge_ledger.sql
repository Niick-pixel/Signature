-- Rolls back 037_edge_ledger.sql: drops only what it added. Run with
-- `npm run migrate:rollback 037`, the app closed, after a backup.
DROP INDEX IF EXISTS blind_grades_trade;
DROP TABLE IF EXISTS blind_grades;
DROP INDEX IF EXISTS insights_scope;
DROP TABLE IF EXISTS insights;
DROP INDEX IF EXISTS theme_dictionary_phrase;
DROP TABLE IF EXISTS theme_dictionary;
DELETE FROM schema_migrations WHERE name = '037_edge_ledger.sql';
