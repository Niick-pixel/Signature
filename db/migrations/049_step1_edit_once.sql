-- Step 1 can be edited once. Additive: two nullable columns, and the Step 1
-- locks recreated with one way through.
--
-- What stays locked for good: the decision (take / pass / missed), when it was
-- made, how long it took, the clock it ran on, the override, the late rows and
-- the row timings — the record of the moment.
-- What may change, once: the answers the grade is made of (the four rows, the
-- gate, the leg location, the HTF origin), and with them the frozen grade.
-- The edit is the update that sets step1_edited_at; step1_original keeps what
-- Step 1 said before it (answers and grade, JSON), and neither can change again.
-- An edit made after the outcome was written is told apart from its timestamps
-- (lib/decision step1EditedAfterOutcome) and leaves the v2 sample.
-- Rollback: db/rollback/049_step1_edit_once.sql.

ALTER TABLE trades ADD COLUMN step1_edited_at TEXT;
ALTER TABLE trades ADD COLUMN step1_original TEXT;

DROP TRIGGER IF EXISTS trades_decision_locked;
DROP TRIGGER IF EXISTS trades_decision_locked_047;

-- The decision and its clock: never.
CREATE TRIGGER trades_decision_locked_049
BEFORE UPDATE OF decision, decided_at, decision_seconds, decision_limit, grade_override, late_rows
ON trades
WHEN OLD.decided_at IS NOT NULL AND (
  NEW.decision IS NOT OLD.decision OR NEW.decided_at IS NOT OLD.decided_at
  OR NEW.decision_seconds IS NOT OLD.decision_seconds OR NEW.decision_limit IS NOT OLD.decision_limit
  OR NEW.grade_override IS NOT OLD.grade_override OR NEW.late_rows IS NOT OLD.late_rows)
BEGIN
  SELECT RAISE(ABORT, 'Step 1 is locked: the decision and its time cannot be edited.');
END;

-- The answers: once, in the update that marks the edit.
CREATE TRIGGER trades_step1_answers_locked
BEFORE UPDATE OF row_sweep, row_inversion, row_path, row_target, leg_location, singular_gap, htf_origin
ON trades
WHEN OLD.decided_at IS NOT NULL
  AND NOT (OLD.step1_edited_at IS NULL AND NEW.step1_edited_at IS NOT NULL)
  AND (NEW.row_sweep IS NOT OLD.row_sweep OR NEW.row_inversion IS NOT OLD.row_inversion
    OR NEW.row_path IS NOT OLD.row_path OR NEW.row_target IS NOT OLD.row_target
    OR NEW.leg_location IS NOT OLD.leg_location OR NEW.singular_gap IS NOT OLD.singular_gap
    OR NEW.htf_origin IS NOT OLD.htf_origin)
BEGIN
  SELECT RAISE(ABORT, 'Step 1 is locked: it changes only through its one edit (Edit Step 1).');
END;

-- The edit itself is written once.
CREATE TRIGGER trades_step1_edit_once
BEFORE UPDATE OF step1_edited_at, step1_original
ON trades
WHEN OLD.step1_edited_at IS NOT NULL
  AND (NEW.step1_edited_at IS NOT OLD.step1_edited_at OR NEW.step1_original IS NOT OLD.step1_original)
BEGIN
  SELECT RAISE(ABORT, 'Step 1 was already edited once.');
END;

-- The frozen grade may follow that one edit, on a Rubric v2 trade only.
DROP TRIGGER IF EXISTS trades_grade_at_entry_locked;
CREATE TRIGGER trades_grade_at_entry_locked
BEFORE UPDATE OF rubric_version, score_at_entry, letter_at_entry, trigger_fired_at_entry, grade_at_entry
ON trades FOR EACH ROW
WHEN OLD.status <> 'Planned'
  AND NOT (OLD.rubric_version = 5 AND NEW.rubric_version = 5 AND OLD.decided_at IS NOT NULL
    AND OLD.step1_edited_at IS NULL AND NEW.step1_edited_at IS NOT NULL)
  AND (
     NEW.rubric_version         IS NOT OLD.rubric_version
  OR NEW.score_at_entry         IS NOT OLD.score_at_entry
  OR NEW.letter_at_entry        IS NOT OLD.letter_at_entry
  OR NEW.trigger_fired_at_entry IS NOT OLD.trigger_fired_at_entry
  OR NEW.grade_at_entry         IS NOT OLD.grade_at_entry)
BEGIN
  SELECT RAISE(ABORT, 'The grade at entry is locked once a trade leaves Planned.');
END;
