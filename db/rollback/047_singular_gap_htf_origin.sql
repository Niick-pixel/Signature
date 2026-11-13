-- Rolls back 047_singular_gap_htf_origin.sql: drops only what it added (the
-- checklist's singular_gap column predates it and stays). Run with
-- `npm run migrate:rollback 047`, the app closed, after a backup.
DROP TRIGGER IF EXISTS trades_decision_locked_047;
ALTER TABLE trades DROP COLUMN htf_origin;
DELETE FROM schema_migrations WHERE name = '047_singular_gap_htf_origin.sql';
