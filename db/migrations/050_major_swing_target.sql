-- signature: foreign-keys-off
-- "Major swing H/L" as a target type: a 1H+ swing that started a displacement
-- leg and is still untaken after several sessions. (PWH/PWL needs nothing:
-- it is stored as the existing "Weekly high/low".)
--
-- The target list is a CHECK, which SQLite cannot alter in place, so trades is
-- rebuilt exactly as it is: this file was generated from the live schema after
-- 049 (every stored column, all indexes and triggers), and the only change is
-- 'Major swing H/L' added to the target_type list. Every row is copied 1:1; no
-- column is dropped, renamed or given a new meaning.
--
-- Executions, bars and study notes point at trades with ON DELETE CASCADE /
-- SET NULL. Dropping the old table with foreign keys on would delete those
-- rows, so the first line asks the migration runner (db/migrate.ts) to switch
-- foreign keys off for this file and to check them before it commits — the
-- rebuild order SQLite documents (https://www.sqlite.org/lang_altertable.html).
--
-- NOTE for the next table-rebuild migration: generate it from the live
-- schema the same way, with the same first line.
-- Rollback: db/rollback/050_major_swing_target.sql.

CREATE TABLE trades_rebuilt (
  id                  TEXT    PRIMARY KEY,
  date                TEXT    NOT NULL,
  instrument          TEXT    NOT NULL CHECK (instrument IN ('NQ','MNQ','NAS100','Other')),
  direction           TEXT    NOT NULL CHECK (direction IN ('Long','Short')),
  session             TEXT    NOT NULL CHECK (session IN ('Asia','London','NY AM','NY Lunch','NY PM')),
  macro_time          INTEGER NOT NULL DEFAULT 0 CHECK (macro_time IN (0,1)),
  macro_time_auto     INTEGER NOT NULL DEFAULT 1 CHECK (macro_time_auto IN (0,1)),
  reason              TEXT    NOT NULL CHECK (reason IN (
                        'Rules-based (A+ setup)','Rules-based (B setup)','FOMO','Revenge',
                        'Boredom','Idea / hypothesis','Following the market','Following someone else',
                        'Impatience (early entry)','Hesitation (late entry)','Overleveraged','News reaction',
                        -- 019: why a backtest was taken — offered on Backtest only.
                        'Backtest replay')),
  setup_type          TEXT    NOT NULL CHECK (setup_type IN (
                        'iFVG','Double iFVG','iFVG + SMT','MSS + FVG','CISD',
                        'Order Block','Breaker','Unicorn (Breaker + FVG)','Propulsion Block',
                        'Mitigation Block','Rejection Block','Liquidity Void',
                        'Balanced Price Range','Turtle Soup','Silver Bullet','Other')),
  htf_bias            TEXT    NOT NULL CHECK (htf_bias IN ('With bias','Against bias','No bias defined')),
  sweep_before_entry  INTEGER NOT NULL DEFAULT 0 CHECK (sweep_before_entry IN (0,1)),
  -- A checklist gate now, not a context pill. NULL = never answered: every
  -- trade from before 015 that did not tick it, since the old pill defaulted
  -- to 0 and a "no" could not be told from "never looked".
  singular_gap        INTEGER          CHECK (singular_gap IS NULL OR singular_gap IN (0,1)),  -- 10, gate
  target_unswept      INTEGER NOT NULL DEFAULT 0 CHECK (target_unswept IN (0,1)),
  premium_discount    TEXT    NOT NULL CHECK (premium_discount IN ('Discount','Equilibrium','Premium')),
  -- Named targets only. 'Other' is no longer offered; it, 'Horizontal
  -- liquidity pool' and 'Opposing FVG' stay legal for the trades filed under
  -- them. 'Data wick' and 'Diagonal trendline' were renamed, rows and all.
  target_type         TEXT    NOT NULL CHECK (target_type IN (
                        'PDH/PDL','Weekly high/low','Session high/low','EQH/EQL','Data wick',
                        'HTF FVG (1H/4H)','ITH/ITL','LRLR (trendline)','Major swing H/L',
                        -- retired, still legal for the trades filed under them
                        'Order block','CISD','Horizontal liquidity pool','Opposing FVG','Other')),
  smt                 INTEGER NOT NULL DEFAULT 0 CHECK (smt IN (0,1)),
  displacement            INTEGER NOT NULL DEFAULT 0 CHECK (displacement            IN (0,1)),
  mss_confirmed           INTEGER NOT NULL DEFAULT 0 CHECK (mss_confirmed           IN (0,1)),
  volume_imbalance        INTEGER NOT NULL DEFAULT 0 CHECK (volume_imbalance        IN (0,1)),
  consequent_encroachment INTEGER NOT NULL DEFAULT 0 CHECK (consequent_encroachment IN (0,1)),
  equal_highs_lows        INTEGER NOT NULL DEFAULT 0 CHECK (equal_highs_lows        IN (0,1)),
  retest_entry            INTEGER NOT NULL DEFAULT 0 CHECK (retest_entry            IN (0,1)),
  news_window             INTEGER NOT NULL DEFAULT 0 CHECK (news_window             IN (0,1)),

  chk_htf_bias         INTEGER          CHECK (chk_htf_bias         IS NULL OR chk_htf_bias         IN (0,1)),  -- 10
  chk_killzone         INTEGER          CHECK (chk_killzone         IS NULL OR chk_killzone         IN (0,1)),  -- 10
  chk_no_news          INTEGER          CHECK (chk_no_news          IS NULL OR chk_no_news          IN (0,1)),  --  5
  chk_sweep            INTEGER          CHECK (chk_sweep            IS NULL OR chk_sweep            IN (0,1)),  -- rubric 1 only
  -- The sweep, as a tier (rubric 2): major 20, minor 12, none 0. A gate.
  sweep_tier           TEXT             CHECK (sweep_tier IS NULL OR sweep_tier IN ('major','minor','none')),
  chk_displacement_fvg INTEGER          CHECK (chk_displacement_fvg IS NULL OR chk_displacement_fvg IN (0,1)),  -- 10
  chk_targets_clear    INTEGER          CHECK (chk_targets_clear    IS NULL OR chk_targets_clear    IN (0,1)),  -- 10
  chk_clean_path       INTEGER          CHECK (chk_clean_path       IS NULL OR chk_clean_path       IN (0,1)),  --  5
  chk_returned_to_fvg  INTEGER NOT NULL DEFAULT 0 CHECK (chk_returned_to_fvg  IN (0,1)),  --  5
  chk_inversion_close  INTEGER NOT NULL DEFAULT 0 CHECK (chk_inversion_close  IN (0,1)),  -- 15

  -- The LIVE grade, under the current rubric (3). Everything else reads the
  -- frozen *_at_entry columns below; these exist for the form and must match
  -- RUBRICS[3] in lib/rubric.ts exactly — tests/migrations.test.mts checks.
  checklist_earned INTEGER GENERATED ALWAYS AS (
      COALESCE(chk_htf_bias,0)*10 + COALESCE(chk_killzone,0)*10 + COALESCE(chk_no_news,0)*5 +
      (CASE sweep_tier WHEN 'major' THEN 20 WHEN 'minor' THEN 12 ELSE 0 END) +
      COALESCE(singular_gap,0)*10 + COALESCE(chk_displacement_fvg,0)*10 +
      COALESCE(chk_targets_clear,0)*10 + COALESCE(chk_clean_path,0)*5 +
      COALESCE(chk_returned_to_fvg,0)*5 + COALESCE(chk_inversion_close,0)*15
  ) STORED,

  -- What was on the table. A box marked NULL did not apply, so its points are
  -- not offered — except the gates and the trigger, which always are.
  checklist_possible INTEGER GENERATED ALWAYS AS (
      (CASE WHEN chk_htf_bias IS NULL THEN 0 ELSE 10 END) +
      (CASE WHEN chk_killzone IS NULL THEN 0 ELSE 10 END) +
      (CASE WHEN chk_no_news IS NULL THEN 0 ELSE 5 END) +
      20 + 10 +
      (CASE WHEN chk_displacement_fvg IS NULL THEN 0 ELSE 10 END) +
      (CASE WHEN chk_targets_clear IS NULL THEN 0 ELSE 10 END) +
      (CASE WHEN chk_clean_path IS NULL THEN 0 ELSE 5 END) +
      5 + 15
  ) STORED,

  checklist_score INTEGER GENERATED ALWAYS AS (
    CASE WHEN checklist_possible = 0 THEN 0
         ELSE CAST(ROUND(checklist_earned * 100.0 / checklist_possible) AS INTEGER) END
  ) STORED,

  trigger_fired INTEGER GENERATED ALWAYS AS (
    CASE WHEN chk_returned_to_fvg = 1 AND chk_inversion_close = 1 THEN 1 ELSE 0 END
  ) STORED,

  -- The bands, then the gates. No nameable sweep, or not one clean gap: not
  -- the model, max C. A diagonal target: max B. Whatever the total.
  grade_letter TEXT GENERATED ALWAYS AS (
    CASE
      WHEN COALESCE(sweep_tier,'none') = 'none' OR COALESCE(singular_gap,0) = 0 THEN
        CASE WHEN checklist_score >= 50 THEN 'C' ELSE 'F' END
      WHEN target_type = 'LRLR (trendline)' THEN
        CASE WHEN checklist_score >= 70 THEN 'B' WHEN checklist_score >= 50 THEN 'C' ELSE 'F' END
      -- A+ is a perfect trade: every point that applied, nothing less.
      WHEN checklist_score >= 100 THEN 'A+'
      WHEN checklist_score >= 80 THEN 'A'
      WHEN checklist_score >= 70 THEN 'B'
      WHEN checklist_score >= 50 THEN 'C'
      ELSE 'F'
    END
  ) STORED,

  -- Tri-state on purpose. NULL is "I did not answer", which is the honest
  -- state of every trade until I say otherwise, and is NOT the same as "no".
  followed_rules INTEGER CHECK (followed_rules IS NULL OR followed_rules IN (0,1)),

  regrade     TEXT CHECK (regrade IS NULL OR regrade IN ('A+','A','A-','B+','B','B-','C','F')),
  -- Legacy single tag, kept so nothing written under the old taxonomy is lost.
  mistake_tag TEXT,
  -- A bad trade usually has three. JSON array; the values are validated in
  -- lib/validate.ts against MISTAKE_TAGS, which SQLite cannot do for an array.
  mistake_tags TEXT CHECK (mistake_tags IS NULL OR json_valid(mistake_tags)),

  -- Backtest R and live R must never sum into the same number.
  -- 'Funded' joins the list; 'Backtest (FX Replay)' stays legal but is no
  -- longer offered. Dropping it from the CHECK would make every backtest trade
  -- already on record unwritable, which is the app destroying its own history
  -- to tidy a dropdown.
  account       TEXT NOT NULL DEFAULT 'Live'
                CHECK (account IN ('Backtest (FX Replay)','Demo','Live','Eval','Funded','Missed')),
  account_label TEXT,

  -- Optional two-stage logging. 'Settled' is the default because logging a
  -- finished trade in one shot must stay the fast path.
  status TEXT NOT NULL DEFAULT 'Settled' CHECK (status IN ('Planned','Live','Settled')),
  -- The score as it stood before the outcome was known. Stats read this one.
  grade_at_entry INTEGER,
  -- True when the whole trade was logged after the fact, so hindsight-graded
  -- and pre-graded trades can never be pooled.
  graded_post_hoc INTEGER NOT NULL DEFAULT 1 CHECK (graded_post_hoc IN (0,1)),

  entry_price  REAL,
  take_profit  REAL,
  stop_loss    REAL,

  would_have_hit_tp INTEGER CHECK (would_have_hit_tp IS NULL OR would_have_hit_tp IN (0,1)),
  r_left_on_table   REAL,
  skip_reason       TEXT CHECK (skip_reason IS NULL OR skip_reason IN ('Fear','Rule','Distracted','Missed it')),

  contracts           INTEGER,
  -- Risk cannot be negative. It used to be able to, and since P&L is
  -- risk x R, a negative risk turned every loss into a win.
  risk_dollars        REAL    CHECK (risk_dollars IS NULL OR risk_dollars >= 0),
  risk_percent        REAL    CHECK (risk_percent IS NULL OR risk_percent >= 0),
  stop_points         REAL,
  outcome             TEXT    NOT NULL CHECK (outcome IN ('Win','Loss','Breakeven','Scratched','Not taken')),
  r_multiple          REAL,
  -- No length rule here any more. The form still asks for a real explanation;
  -- the schema must not, or a fast entry on a bad day cannot be recorded at all.
  explanation         TEXT    NOT NULL DEFAULT '',
  lesson              TEXT,
  -- '' when a quick log was saved without a chart; the card says so.
  screenshot_path     TEXT    NOT NULL DEFAULT '',
  position_x          REAL,
  position_y          REAL,
  -- Soft delete. Nothing leaves the journal without a second, deliberate act.
  deleted_at          TEXT,
  -- Why it was deleted, asked every time. Cleared on restore; the edit log
  -- keeps every reason ever given.
  deleted_reason      TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
, entry_time TEXT, exit_time  TEXT, mae_r      REAL, mfe_r      REAL, mae_points REAL, mfe_points REAL, reached_1r INTEGER CHECK (reached_1r IS NULL OR reached_1r IN (0,1)), confidence_at_entry INTEGER
  CHECK (confidence_at_entry IS NULL OR confidence_at_entry BETWEEN 1 AND 5), would_be_r REAL, playbook_id TEXT, pnl_dollars REAL,

  -- Saved through "Log it fast", past the form's minimums. Stats can leave these out.
  quick_log              INTEGER NOT NULL DEFAULT 0 CHECK (quick_log IN (0,1)),

  -- The grade as the rubric in force stood when the trade was written. The
  -- generated columns above follow the CURRENT weights and thresholds; these
  -- do not, so a rubric change never re-grades history. See db/RUBRIC.md.
  rubric_version         INTEGER NOT NULL DEFAULT 1,
  score_at_entry         INTEGER,
  letter_at_entry        TEXT CHECK (letter_at_entry IS NULL OR letter_at_entry IN ('A+','A','B','C','F')),
  trigger_fired_at_entry INTEGER CHECK (trigger_fired_at_entry IS NULL OR trigger_fired_at_entry IN (0,1)),

  -- What went right, the mirror of mistake_tags. JSON array, validated in
  -- lib/validate.ts against WORKED_TAGS.
  worked_tags TEXT CHECK (worked_tags IS NULL OR json_valid(worked_tags))
, sweep_level TEXT, sweep_futures_confirmed INTEGER
  CHECK (sweep_futures_confirmed IS NULL OR sweep_futures_confirmed IN (0,1)), htf_delivery TEXT,

  -- 019: a backtest logged without a day. `date` then holds when it was
  -- logged, never the day it happened (lib/domain.ts isDated).
  undated INTEGER NOT NULL DEFAULT 0 CHECK (undated IN (0,1))
, target_hit INTEGER
  CHECK (target_hit IS NULL OR target_hit IN (0,1)), target_fresh INTEGER
  CHECK (target_fresh IS NULL OR target_fresh IN (0,1)), opposite_taken INTEGER
  CHECK (opposite_taken IS NULL OR opposite_taken IN (0,1)), mgmt_plan TEXT
  CHECK (mgmt_plan IS NULL OR mgmt_plan IN ('A','B')), partial_at TEXT, market_tags TEXT CHECK (market_tags IS NULL OR json_valid(market_tags)), overrides TEXT CHECK (overrides IS NULL OR json_valid(overrides)), grade_locked_at TEXT, chart_date TEXT
  CHECK (chart_date IS NULL OR chart_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), nearest_liquidity_type TEXT, nearest_liquidity_price REAL, opposing_swings_between TEXT
  CHECK (opposing_swings_between IS NULL OR opposing_swings_between IN ('0','1','2+')), r_to_nearest REAL, target_check_passed INTEGER
  CHECK (target_check_passed IS NULL OR target_check_passed IN (0,1)), eqhl_checks TEXT CHECK (eqhl_checks IS NULL OR json_valid(eqhl_checks)), be_trigger TEXT
  CHECK (be_trigger IS NULL OR be_trigger IN ('1R','Structure break','None')), below_min_confidence INTEGER
  CHECK (below_min_confidence IS NULL OR below_min_confidence IN (0,1)), written_before_outcome INTEGER
  CHECK (written_before_outcome IS NULL OR written_before_outcome IN (0,1)), r_to_nearest_bucket TEXT
  CHECK (r_to_nearest_bucket IS NULL OR r_to_nearest_bucket IN ('<1','1-1.5','1.5-2','2+')), management TEXT
  CHECK (management IS NULL OR management IN
    ('Hold to stop or target','BE at 1R','BE on structure break','Partial at 1R, runner','Other')), exit_price REAL, fees_dollars REAL CHECK (fees_dollars IS NULL OR fees_dollars >= 0), session_index INTEGER CHECK (session_index IS NULL OR session_index >= 1), htf_bias_tf TEXT, liquidity_event TEXT, sweep_tf TEXT, fvg_tf TEXT, entry_tf TEXT, fvg_quality TEXT, candle_strength INTEGER CHECK (candle_strength IS NULL OR candle_strength BETWEEN 0 AND 4), inversion_speed INTEGER CHECK (inversion_speed IS NULL OR inversion_speed BETWEEN 0 AND 3), rr_score INTEGER CHECK (rr_score IS NULL OR rr_score BETWEEN 0 AND 3), cisd INTEGER CHECK (cisd IS NULL OR cisd IN (0,1)), smt_state TEXT, into_eq_pool INTEGER CHECK (into_eq_pool IS NULL OR into_eq_pool IN (0,1)), planned_rr TEXT, entry_method TEXT, stop_method TEXT, pre_state INTEGER CHECK (pre_state IS NULL OR pre_state BETWEEN 1 AND 5), exit_reason TEXT, mfe_bucket TEXT, mae_bucket TEXT, target_hit_later TEXT, moved_to_be TEXT, blind_grade TEXT, entry_line_x REAL CHECK (entry_line_x IS NULL OR (entry_line_x >= 0 AND entry_line_x <= 1)), rule_breaks_manual TEXT, emotion_after TEXT, opposing_htf_gap TEXT
  CHECK (opposing_htf_gap IS NULL OR opposing_htf_gap IN ('None','5m','15m','1H','4H')), stop_placement TEXT
  CHECK (stop_placement IS NULL OR stop_placement IN
    ('Beyond sweep extreme','Beyond HTF zone far edge','Under-over the iFVG','Inside the zone')), drill_key TEXT, drill_kept TEXT CHECK (drill_kept IS NULL OR drill_kept IN ('kept','broken','n/a')), partial_win INTEGER CHECK (partial_win IS NULL OR partial_win IN (0, 1)), plan_scenario TEXT CHECK (plan_scenario IS NULL OR plan_scenario IN ('A', 'B', 'none')), row_sweep     INTEGER CHECK (row_sweep     IS NULL OR row_sweep     IN (0, 1, 2)), row_inversion INTEGER CHECK (row_inversion IS NULL OR row_inversion IN (0, 1, 2)), row_path      INTEGER CHECK (row_path      IS NULL OR row_path      IN (0, 1, 2)), row_target    INTEGER CHECK (row_target    IS NULL OR row_target    IN (0, 1, 2)), leg_location  TEXT CHECK (leg_location IS NULL OR leg_location IN ('Discount', 'EQ', 'Premium')), decision      TEXT CHECK (decision IS NULL OR decision IN ('take', 'pass', 'missed')), decided_at    TEXT, decision_seconds REAL CHECK (decision_seconds IS NULL OR decision_seconds >= 0), decision_limit   INTEGER CHECK (decision_limit IS NULL OR decision_limit > 0), grade_override INTEGER CHECK (grade_override IS NULL OR grade_override IN (0, 1)), late_rows     TEXT, outcome_at    TEXT, would_be_mfe_r REAL, htf_origin TEXT CHECK (htf_origin IS NULL OR htf_origin IN ('None', '5m', '15m', '30m', '1H', '4H')), replay_day_id TEXT REFERENCES replay_days (id) ON DELETE SET NULL, row_times TEXT, pass_reasons TEXT, pass_main_reason TEXT, step1_edited_at TEXT, step1_original TEXT);
INSERT INTO trades_rebuilt (id, date, instrument, direction, session, macro_time, macro_time_auto, reason, setup_type, htf_bias, sweep_before_entry, singular_gap, target_unswept, premium_discount, target_type, smt, displacement, mss_confirmed, volume_imbalance, consequent_encroachment, equal_highs_lows, retest_entry, news_window, chk_htf_bias, chk_killzone, chk_no_news, chk_sweep, sweep_tier, chk_displacement_fvg, chk_targets_clear, chk_clean_path, chk_returned_to_fvg, chk_inversion_close, followed_rules, regrade, mistake_tag, mistake_tags, account, account_label, status, grade_at_entry, graded_post_hoc, entry_price, take_profit, stop_loss, would_have_hit_tp, r_left_on_table, skip_reason, contracts, risk_dollars, risk_percent, stop_points, outcome, r_multiple, explanation, lesson, screenshot_path, position_x, position_y, deleted_at, deleted_reason, created_at, updated_at, entry_time, exit_time, mae_r, mfe_r, mae_points, mfe_points, reached_1r, confidence_at_entry, would_be_r, playbook_id, pnl_dollars, quick_log, rubric_version, score_at_entry, letter_at_entry, trigger_fired_at_entry, worked_tags, sweep_level, sweep_futures_confirmed, htf_delivery, undated, target_hit, target_fresh, opposite_taken, mgmt_plan, partial_at, market_tags, overrides, grade_locked_at, chart_date, nearest_liquidity_type, nearest_liquidity_price, opposing_swings_between, r_to_nearest, target_check_passed, eqhl_checks, be_trigger, below_min_confidence, written_before_outcome, r_to_nearest_bucket, management, exit_price, fees_dollars, session_index, htf_bias_tf, liquidity_event, sweep_tf, fvg_tf, entry_tf, fvg_quality, candle_strength, inversion_speed, rr_score, cisd, smt_state, into_eq_pool, planned_rr, entry_method, stop_method, pre_state, exit_reason, mfe_bucket, mae_bucket, target_hit_later, moved_to_be, blind_grade, entry_line_x, rule_breaks_manual, emotion_after, opposing_htf_gap, stop_placement, drill_key, drill_kept, partial_win, plan_scenario, row_sweep, row_inversion, row_path, row_target, leg_location, decision, decided_at, decision_seconds, decision_limit, grade_override, late_rows, outcome_at, would_be_mfe_r, htf_origin, replay_day_id, row_times, pass_reasons, pass_main_reason, step1_edited_at, step1_original)
  SELECT id, date, instrument, direction, session, macro_time, macro_time_auto, reason, setup_type, htf_bias, sweep_before_entry, singular_gap, target_unswept, premium_discount, target_type, smt, displacement, mss_confirmed, volume_imbalance, consequent_encroachment, equal_highs_lows, retest_entry, news_window, chk_htf_bias, chk_killzone, chk_no_news, chk_sweep, sweep_tier, chk_displacement_fvg, chk_targets_clear, chk_clean_path, chk_returned_to_fvg, chk_inversion_close, followed_rules, regrade, mistake_tag, mistake_tags, account, account_label, status, grade_at_entry, graded_post_hoc, entry_price, take_profit, stop_loss, would_have_hit_tp, r_left_on_table, skip_reason, contracts, risk_dollars, risk_percent, stop_points, outcome, r_multiple, explanation, lesson, screenshot_path, position_x, position_y, deleted_at, deleted_reason, created_at, updated_at, entry_time, exit_time, mae_r, mfe_r, mae_points, mfe_points, reached_1r, confidence_at_entry, would_be_r, playbook_id, pnl_dollars, quick_log, rubric_version, score_at_entry, letter_at_entry, trigger_fired_at_entry, worked_tags, sweep_level, sweep_futures_confirmed, htf_delivery, undated, target_hit, target_fresh, opposite_taken, mgmt_plan, partial_at, market_tags, overrides, grade_locked_at, chart_date, nearest_liquidity_type, nearest_liquidity_price, opposing_swings_between, r_to_nearest, target_check_passed, eqhl_checks, be_trigger, below_min_confidence, written_before_outcome, r_to_nearest_bucket, management, exit_price, fees_dollars, session_index, htf_bias_tf, liquidity_event, sweep_tf, fvg_tf, entry_tf, fvg_quality, candle_strength, inversion_speed, rr_score, cisd, smt_state, into_eq_pool, planned_rr, entry_method, stop_method, pre_state, exit_reason, mfe_bucket, mae_bucket, target_hit_later, moved_to_be, blind_grade, entry_line_x, rule_breaks_manual, emotion_after, opposing_htf_gap, stop_placement, drill_key, drill_kept, partial_win, plan_scenario, row_sweep, row_inversion, row_path, row_target, leg_location, decision, decided_at, decision_seconds, decision_limit, grade_override, late_rows, outcome_at, would_be_mfe_r, htf_origin, replay_day_id, row_times, pass_reasons, pass_main_reason, step1_edited_at, step1_original FROM trades;
DROP TABLE trades;
ALTER TABLE trades_rebuilt RENAME TO trades;
CREATE INDEX idx_trades_account     ON trades(account);
CREATE INDEX idx_trades_date        ON trades(date DESC);
CREATE INDEX idx_trades_deleted     ON trades(deleted_at);
CREATE INDEX idx_trades_grade       ON trades(checklist_score);
CREATE INDEX idx_trades_outcome     ON trades(outcome);
CREATE INDEX idx_trades_playbook    ON trades(playbook_id);
CREATE INDEX idx_trades_reason      ON trades(reason);
CREATE INDEX idx_trades_status      ON trades(status);
CREATE INDEX idx_trades_sweep_tier  ON trades(sweep_tier);
CREATE INDEX idx_trades_target_type ON trades(target_type);
CREATE TRIGGER trades_decision_locked_048
BEFORE UPDATE OF row_times
ON trades
WHEN OLD.decided_at IS NOT NULL AND NEW.row_times IS NOT OLD.row_times
BEGIN
  SELECT RAISE(ABORT, 'Step 1 is locked: the decision and its grade cannot be edited. Use the honest re-grade.');
END;
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
CREATE TRIGGER trades_loss_negative_insert
AFTER INSERT ON trades FOR EACH ROW
WHEN NEW.outcome = 'Loss' AND (NEW.pnl_dollars > 0 OR NEW.r_multiple > 0)
BEGIN
  UPDATE trades SET
    pnl_dollars = CASE WHEN pnl_dollars > 0 THEN -pnl_dollars ELSE pnl_dollars END,
    r_multiple  = CASE WHEN r_multiple  > 0 THEN -r_multiple  ELSE r_multiple  END
  WHERE id = NEW.id;
END;
CREATE TRIGGER trades_loss_negative_update
AFTER UPDATE OF outcome, pnl_dollars, r_multiple ON trades FOR EACH ROW
WHEN NEW.outcome = 'Loss' AND (NEW.pnl_dollars > 0 OR NEW.r_multiple > 0)
BEGIN
  UPDATE trades SET
    pnl_dollars = CASE WHEN pnl_dollars > 0 THEN -pnl_dollars ELSE pnl_dollars END,
    r_multiple  = CASE WHEN r_multiple  > 0 THEN -r_multiple  ELSE r_multiple  END
  WHERE id = NEW.id;
END;
CREATE TRIGGER trades_no_return_to_planned
BEFORE UPDATE OF status ON trades FOR EACH ROW
WHEN OLD.status <> 'Planned' AND NEW.status = 'Planned'
BEGIN
  SELECT RAISE(ABORT, 'A trade that has left Planned cannot go back to it: its grade at entry is locked.');
END;
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
CREATE TRIGGER trades_step1_edit_once
BEFORE UPDATE OF step1_edited_at, step1_original
ON trades
WHEN OLD.step1_edited_at IS NOT NULL
  AND (NEW.step1_edited_at IS NOT OLD.step1_edited_at OR NEW.step1_original IS NOT OLD.step1_original)
BEGIN
  SELECT RAISE(ABORT, 'Step 1 was already edited once.');
END;
CREATE TRIGGER trades_touch_updated_at
AFTER UPDATE ON trades FOR EACH ROW
BEGIN
  UPDATE trades SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = OLD.id;
END;
