-- Which of the morning's written plans a trade was: Scenario A, Scenario B,
-- or neither (lib/prep, the prep's last step). Additive: one nullable column.
-- NULL = not asked (no plans written that morning, a backtest, or a trade
-- logged before this) — never read as "neither".
-- Rollback: db/rollback/045_plan_scenario.sql (npm run migrate:rollback 045).
ALTER TABLE trades ADD COLUMN plan_scenario TEXT CHECK (plan_scenario IS NULL OR plan_scenario IN ('A', 'B', 'none'));
