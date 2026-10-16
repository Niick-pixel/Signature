-- An Eval account: a paid prop evaluation, kept apart from Live and Funded so
-- the Path can hold it behind a commitment ("no paid eval until the demo
-- evaluation is passed").
--
-- The account list is a CHECK, which SQLite cannot alter in place, so trades
-- and cash_events are rebuilt exactly as they are: this file was generated
-- from the live schema (every stored column, the 023 market_tags column, all
-- ten indexes and all five triggers), and the only change is 'Eval' added to
-- the two account lists. Every row is copied 1:1; no column is dropped,
-- renamed or given a new meaning.
--
-- NOTE for the next table-rebuild migration: generate it from the live
-- schema the same way.

-- trades
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
                        'HTF FVG (1H/4H)','ITH/ITL','LRLR (trendline)',
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
  CHECK (mgmt_plan IS NULL OR mgmt_plan IN ('A','B')), partial_at TEXT, market_tags TEXT CHECK (market_tags IS NULL OR json_valid(market_tags)));
INSERT INTO trades_rebuilt (id, date, instrument, direction, session, macro_time, macro_time_auto, reason, setup_type, htf_bias, sweep_before_entry, singular_gap, target_unswept, premium_discount, target_type, smt, displacement, mss_confirmed, volume_imbalance, consequent_encroachment, equal_highs_lows, retest_entry, news_window, chk_htf_bias, chk_killzone, chk_no_news, chk_sweep, sweep_tier, chk_displacement_fvg, chk_targets_clear, chk_clean_path, chk_returned_to_fvg, chk_inversion_close, followed_rules, regrade, mistake_tag, mistake_tags, account, account_label, status, grade_at_entry, graded_post_hoc, entry_price, take_profit, stop_loss, would_have_hit_tp, r_left_on_table, skip_reason, contracts, risk_dollars, risk_percent, stop_points, outcome, r_multiple, explanation, lesson, screenshot_path, position_x, position_y, deleted_at, deleted_reason, created_at, updated_at, entry_time, exit_time, mae_r, mfe_r, mae_points, mfe_points, reached_1r, confidence_at_entry, would_be_r, playbook_id, pnl_dollars, quick_log, rubric_version, score_at_entry, letter_at_entry, trigger_fired_at_entry, worked_tags, sweep_level, sweep_futures_confirmed, htf_delivery, undated, target_hit, target_fresh, opposite_taken, mgmt_plan, partial_at, market_tags)
  SELECT id, date, instrument, direction, session, macro_time, macro_time_auto, reason, setup_type, htf_bias, sweep_before_entry, singular_gap, target_unswept, premium_discount, target_type, smt, displacement, mss_confirmed, volume_imbalance, consequent_encroachment, equal_highs_lows, retest_entry, news_window, chk_htf_bias, chk_killzone, chk_no_news, chk_sweep, sweep_tier, chk_displacement_fvg, chk_targets_clear, chk_clean_path, chk_returned_to_fvg, chk_inversion_close, followed_rules, regrade, mistake_tag, mistake_tags, account, account_label, status, grade_at_entry, graded_post_hoc, entry_price, take_profit, stop_loss, would_have_hit_tp, r_left_on_table, skip_reason, contracts, risk_dollars, risk_percent, stop_points, outcome, r_multiple, explanation, lesson, screenshot_path, position_x, position_y, deleted_at, deleted_reason, created_at, updated_at, entry_time, exit_time, mae_r, mfe_r, mae_points, mfe_points, reached_1r, confidence_at_entry, would_be_r, playbook_id, pnl_dollars, quick_log, rubric_version, score_at_entry, letter_at_entry, trigger_fired_at_entry, worked_tags, sweep_level, sweep_futures_confirmed, htf_delivery, undated, target_hit, target_fresh, opposite_taken, mgmt_plan, partial_at, market_tags FROM trades;
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
CREATE TRIGGER trades_touch_updated_at
AFTER UPDATE ON trades FOR EACH ROW
BEGIN
  UPDATE trades SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = OLD.id;
END;

-- cash_events
CREATE TABLE cash_events_rebuilt (
  id         TEXT PRIMARY KEY,
  account    TEXT NOT NULL CHECK (account IN ('Backtest (FX Replay)','Demo','Live','Eval','Funded')),
  kind       TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal','reconcile')),
  amount     REAL NOT NULL CHECK (amount >= 0),
  date       TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO cash_events_rebuilt (id, account, kind, amount, date, note, created_at)
  SELECT id, account, kind, amount, date, note, created_at FROM cash_events;
DROP TABLE cash_events;
ALTER TABLE cash_events_rebuilt RENAME TO cash_events;
CREATE INDEX idx_cash_account ON cash_events(account, date);

