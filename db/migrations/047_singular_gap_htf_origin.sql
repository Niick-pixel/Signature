-- Rubric v2 follow-up: the singular-gap gate and the HTF origin, both Step 1
-- answers. Additive: one nullable column and one trigger. Nothing is mapped
-- or rewritten on older trades.
--
-- The gate reuses the checklist's own singular_gap column (1 = ONE clean,
-- unmistakable FVG, 0 = more than one): the same question, so a v2 trade
-- answers it in the same place. Only the HTF origin is new.
-- Rollback: db/rollback/047_singular_gap_htf_origin.sql.

-- A fact only, never graded: the timeframe the reaction started from.
ALTER TABLE trades ADD COLUMN htf_origin TEXT CHECK (htf_origin IS NULL OR htf_origin IN ('None', '5m', '15m', '30m', '1H', '4H'));

-- Locked with the rest of Step 1 once decided (046 names only its own columns).
-- An older trade is never decided, so its checklist answer stays editable as before.
CREATE TRIGGER trades_decision_locked_047
BEFORE UPDATE OF singular_gap, htf_origin
ON trades
WHEN OLD.decided_at IS NOT NULL AND (NEW.singular_gap IS NOT OLD.singular_gap OR NEW.htf_origin IS NOT OLD.htf_origin)
BEGIN
  SELECT RAISE(ABORT, 'Step 1 is locked: the decision and its grade cannot be edited. Use the honest re-grade.');
END;
