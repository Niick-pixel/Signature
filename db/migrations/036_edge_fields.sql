-- The Edge Engine's structured fields (milestone 3). Additive only: every
-- column is nullable, nothing existing is dropped or renamed, and an old
-- trade reads exactly as before with these blank ("not recorded").
-- Rollback: db/rollback/036_edge_fields.sql (npm run migrate:rollback 036).

-- Backtests have no market date; the replay session they belong to.
ALTER TABLE trades ADD COLUMN session_index INTEGER CHECK (session_index IS NULL OR session_index >= 1);

-- Pre-trade setup (known before entry).
ALTER TABLE trades ADD COLUMN htf_bias_tf TEXT;
ALTER TABLE trades ADD COLUMN liquidity_event TEXT;
ALTER TABLE trades ADD COLUMN sweep_tf TEXT;
ALTER TABLE trades ADD COLUMN fvg_tf TEXT;
ALTER TABLE trades ADD COLUMN entry_tf TEXT;
ALTER TABLE trades ADD COLUMN fvg_quality TEXT;
ALTER TABLE trades ADD COLUMN candle_strength INTEGER CHECK (candle_strength IS NULL OR candle_strength BETWEEN 0 AND 4);
ALTER TABLE trades ADD COLUMN inversion_speed INTEGER CHECK (inversion_speed IS NULL OR inversion_speed BETWEEN 0 AND 3);
ALTER TABLE trades ADD COLUMN rr_score INTEGER CHECK (rr_score IS NULL OR rr_score BETWEEN 0 AND 3);
ALTER TABLE trades ADD COLUMN cisd INTEGER CHECK (cisd IS NULL OR cisd IN (0,1));
ALTER TABLE trades ADD COLUMN smt_state TEXT;
ALTER TABLE trades ADD COLUMN into_eq_pool INTEGER CHECK (into_eq_pool IS NULL OR into_eq_pool IN (0,1));
ALTER TABLE trades ADD COLUMN planned_rr TEXT;
ALTER TABLE trades ADD COLUMN entry_method TEXT;
ALTER TABLE trades ADD COLUMN stop_method TEXT;
ALTER TABLE trades ADD COLUMN pre_state INTEGER CHECK (pre_state IS NULL OR pre_state BETWEEN 1 AND 5);

-- Management and outcome.
ALTER TABLE trades ADD COLUMN exit_reason TEXT;
ALTER TABLE trades ADD COLUMN mfe_bucket TEXT;
ALTER TABLE trades ADD COLUMN mae_bucket TEXT;
ALTER TABLE trades ADD COLUMN target_hit_later TEXT;
ALTER TABLE trades ADD COLUMN moved_to_be TEXT;

-- Grade provenance (Blind Re-grade fills these later).
ALTER TABLE trades ADD COLUMN blind_grade TEXT;
ALTER TABLE trades ADD COLUMN entry_line_x REAL CHECK (entry_line_x IS NULL OR (entry_line_x >= 0 AND entry_line_x <= 1));

-- Post-trade.
ALTER TABLE trades ADD COLUMN rule_breaks_manual TEXT;
ALTER TABLE trades ADD COLUMN emotion_after TEXT;

-- Every "similar past setups" prediction shown at the moment the outcome
-- fields were revealed, kept so the engine can score itself later.
CREATE TABLE predictions (
  id          TEXT PRIMARY KEY,
  trade_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  model       TEXT NOT NULL,
  n           INTEGER NOT NULL,
  mean_r      REAL,
  shrunk_r    REAL,
  p_win       REAL,
  neighbours  TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX predictions_trade ON predictions (trade_id);

-- Pre-fill the replay session for existing backtests: one session per
-- evening they were logged, numbered in order. Corrected by hand afterwards.
-- The touch trigger is lifted around it so updated_at keeps meaning "edited by
-- you", and recreated exactly as 024 left it.
DROP TRIGGER trades_touch_updated_at;
UPDATE trades SET session_index = (
  SELECT rk FROM (
    SELECT id, DENSE_RANK() OVER (ORDER BY substr(date, 1, 10)) AS rk
    FROM trades WHERE account = 'Backtest (FX Replay)' AND deleted_at IS NULL
  ) s WHERE s.id = trades.id
) WHERE account = 'Backtest (FX Replay)' AND deleted_at IS NULL;
CREATE TRIGGER trades_touch_updated_at
AFTER UPDATE ON trades FOR EACH ROW
BEGIN
  UPDATE trades SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = OLD.id;
END;
