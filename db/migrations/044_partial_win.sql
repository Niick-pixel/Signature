-- A partial win: a win where only part of the position reached the target
-- (the rest closed earlier, at breakeven or a smaller profit). Additive: one
-- nullable column. The outcome stays 'Win', so every count and stat that
-- reads wins keeps working; this only says which kind of win it was.
-- NULL = not a win, or a win logged before this was asked.
-- Rollback: db/rollback/044_partial_win.sql (npm run migrate:rollback 044).
ALTER TABLE trades ADD COLUMN partial_win INTEGER CHECK (partial_win IS NULL OR partial_win IN (0, 1));
