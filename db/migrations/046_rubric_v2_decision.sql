-- Rubric v2 (4 rows), stored as rubric_version 5: the New trade form as a
-- timed decision (Step 1) and an outcome (Step 2). Additive: nullable columns
-- and one trigger. Old trades keep every field they had; nothing is mapped.
-- Rollback: db/rollback/046_rubric_v2_decision.sql (npm run migrate:rollback 046).

-- The four rows, 0/1/2 each. NULL = not scored (every older trade, or a row
-- left empty when the timer ran out).
ALTER TABLE trades ADD COLUMN row_sweep     INTEGER CHECK (row_sweep     IS NULL OR row_sweep     IN (0, 1, 2));
ALTER TABLE trades ADD COLUMN row_inversion INTEGER CHECK (row_inversion IS NULL OR row_inversion IN (0, 1, 2));
ALTER TABLE trades ADD COLUMN row_path      INTEGER CHECK (row_path      IS NULL OR row_path      IN (0, 1, 2));
ALTER TABLE trades ADD COLUMN row_target    INTEGER CHECK (row_target    IS NULL OR row_target    IN (0, 1, 2));
-- Measured on the leg that made the sweep, not the old swing range (premium_discount).
ALTER TABLE trades ADD COLUMN leg_location  TEXT CHECK (leg_location IS NULL OR leg_location IN ('Discount', 'EQ', 'Premium'));
-- The decision, when it was locked, how long it took and the limit it had (NULL: untimed).
ALTER TABLE trades ADD COLUMN decision      TEXT CHECK (decision IS NULL OR decision IN ('take', 'pass', 'missed'));
ALTER TABLE trades ADD COLUMN decided_at    TEXT;
ALTER TABLE trades ADD COLUMN decision_seconds REAL CHECK (decision_seconds IS NULL OR decision_seconds >= 0);
ALTER TABLE trades ADD COLUMN decision_limit   INTEGER CHECK (decision_limit IS NULL OR decision_limit > 0);
-- Taken although the grade said No trade (asked once, on the form).
ALTER TABLE trades ADD COLUMN grade_override INTEGER CHECK (grade_override IS NULL OR grade_override IN (0, 1));
-- The rows scored in the grace after the timer ran out: a JSON array of row keys.
ALTER TABLE trades ADD COLUMN late_rows     TEXT;
-- Step 2: when the outcome was written. NULL on a decided trade = outcome pending.
ALTER TABLE trades ADD COLUMN outcome_at    TEXT;
-- What a pass or a miss would have reached at best, in R, when known.
ALTER TABLE trades ADD COLUMN would_be_mfe_r REAL;

-- Step 1 is read-only once locked: the rows and the decision cannot change
-- after decided_at is set. (The facts the grade also read — direction, the
-- scenario, the planned R — live in older columns; the server keeps their
-- stored values on every edit of a decided trade, lib/validate v2Fields, and
-- the trigger names only this migration's columns so older rollbacks work.) (The honest re-grade is a
-- separate column and stays open; it can only be harsher, see lib/grade.)
CREATE TRIGGER trades_decision_locked
BEFORE UPDATE OF row_sweep, row_inversion, row_path, row_target, leg_location, decision, decided_at,
  decision_seconds, decision_limit, grade_override, late_rows
ON trades
WHEN OLD.decided_at IS NOT NULL AND (
  NEW.row_sweep IS NOT OLD.row_sweep OR NEW.row_inversion IS NOT OLD.row_inversion
  OR NEW.row_path IS NOT OLD.row_path OR NEW.row_target IS NOT OLD.row_target
  OR NEW.leg_location IS NOT OLD.leg_location OR NEW.decision IS NOT OLD.decision
  OR NEW.decided_at IS NOT OLD.decided_at OR NEW.decision_seconds IS NOT OLD.decision_seconds
  OR NEW.decision_limit IS NOT OLD.decision_limit OR NEW.grade_override IS NOT OLD.grade_override
  OR NEW.late_rows IS NOT OLD.late_rows)
BEGIN
  SELECT RAISE(ABORT, 'Step 1 is locked: the decision and its grade cannot be edited. Use the honest re-grade.');
END;
