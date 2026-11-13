-- Rolls back 049_step1_edit_once.sql: the Step 1 locks as 046, 047 and 015 made them, and the two columns dropped.
-- Run with `npm run migrate:rollback 049`, the app closed, after a backup. Edits already made stay in the answers.
DROP TRIGGER IF EXISTS trades_decision_locked_049;
DROP TRIGGER IF EXISTS trades_step1_answers_locked;
DROP TRIGGER IF EXISTS trades_step1_edit_once;
DROP TRIGGER IF EXISTS trades_grade_at_entry_locked;
CREATE TRIGGER trades_grade_at_entry_locked
BEFORE UPDATE OF rubric_version, score_at_entry, letter_at_entry, trigger_fired_at_entry, grade_at_entry
ON trades FOR EACH ROW
WHEN OLD.status <> 'Planned' AND (
     NEW.rubric_version         IS NOT OLD.rubric_version
  OR NEW.score_at_entry         IS NOT OLD.score_at_entry
  OR NEW.letter_at_entry        IS NOT OLD.letter_at_entry
  OR NEW.trigger_fired_at_entry IS NOT OLD.trigger_fired_at_entry
  OR NEW.grade_at_entry         IS NOT OLD.grade_at_entry)
BEGIN
  SELECT RAISE(ABORT, 'The grade at entry is locked once a trade leaves Planned.');
END;
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

CREATE TRIGGER trades_decision_locked_047
BEFORE UPDATE OF singular_gap, htf_origin
ON trades
WHEN OLD.decided_at IS NOT NULL AND (NEW.singular_gap IS NOT OLD.singular_gap OR NEW.htf_origin IS NOT OLD.htf_origin)
BEGIN
  SELECT RAISE(ABORT, 'Step 1 is locked: the decision and its grade cannot be edited. Use the honest re-grade.');
END;

ALTER TABLE trades DROP COLUMN step1_original;
ALTER TABLE trades DROP COLUMN step1_edited_at;
DELETE FROM schema_migrations WHERE name = '049_step1_edit_once.sql';
