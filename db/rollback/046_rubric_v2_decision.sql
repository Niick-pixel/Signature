-- Rolls back 046_rubric_v2_decision.sql: drops only what it added. Run with
-- `npm run migrate:rollback 046`, the app closed, after a backup.
DROP TRIGGER IF EXISTS trades_decision_locked;
ALTER TABLE trades DROP COLUMN would_be_mfe_r;
ALTER TABLE trades DROP COLUMN outcome_at;
ALTER TABLE trades DROP COLUMN late_rows;
ALTER TABLE trades DROP COLUMN grade_override;
ALTER TABLE trades DROP COLUMN decision_limit;
ALTER TABLE trades DROP COLUMN decision_seconds;
ALTER TABLE trades DROP COLUMN decided_at;
ALTER TABLE trades DROP COLUMN decision;
ALTER TABLE trades DROP COLUMN leg_location;
ALTER TABLE trades DROP COLUMN row_target;
ALTER TABLE trades DROP COLUMN row_path;
ALTER TABLE trades DROP COLUMN row_inversion;
ALTER TABLE trades DROP COLUMN row_sweep;
DELETE FROM schema_migrations WHERE name = '046_rubric_v2_decision.sql';
