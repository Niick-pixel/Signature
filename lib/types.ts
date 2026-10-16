import type {
  Account, ChecklistAnswer, Direction, HtfBias, Instrument, MistakeTag, Outcome, PremiumDiscount, Reason,
  Regrade, Session, SetupType, ShotSlot, SkipReason, SweepTier, TargetType, TradeStatus, Tri, WorkedTag, MarketTag,
  BiasDirection, NewsLevel, BeTrigger, SwingCount, RBucket, Management,
} from './domain';
import type { FlagKey } from './flags';
import type { GradeLetter } from './grade';

/** A trade as the app uses it: real booleans, derived grade attached. */
export interface Trade {
  id: string;
  /**
   * When it happened — or, on an undated backtest, only when it was logged.
   * Anything that reads it as a day (calendars, streaks, weekdays, "today")
   * must skip `undated` trades; see lib/domain.ts isDated.
   */
  date: string;
  /** A backtest logged without a day (019). Only ever true on Backtest. */
  undated: boolean;
  instrument: Instrument;
  direction: Direction;
  session: Session;
  macro_time: boolean;
  macro_time_auto: boolean;
  reason: Reason;
  setup_type: SetupType;
  htf_bias: HtfBias;
  sweep_before_entry: boolean;
  target_unswept: boolean;
  displacement: boolean;
  mss_confirmed: boolean;
  volume_imbalance: boolean;
  consequent_encroachment: boolean;
  equal_highs_lows: boolean;
  retest_entry: boolean;
  news_window: boolean;
  premium_discount: PremiumDiscount;
  target_type: TargetType;
  smt: boolean;
  /*
    The checklist. Generated columns below are derived from exactly these.

    Phase 1 and Phase 2 are tri-state: null means the condition did not apply
    on this trade, so its points were never on the table. Phase 3 is the
    trigger and is always answerable — without it there is no entry to grade.
  */
  chk_htf_bias: ChecklistAnswer;
  chk_killzone: ChecklistAnswer;
  chk_no_news: ChecklistAnswer;
  /** Rubric 1's "Clear sweep of a MAJOR level". Kept for the trades graded under it. */
  chk_sweep: ChecklistAnswer;
  /**
   * Rubric 2's sweep, as a tier: major 20, minor 12, none 0. A gate — none
   * caps the grade at C. Null on a trade logged before the tier existed and
   * never answered since.
   */
  sweep_tier: SweepTier | null;
  /**
   * ONE clean, unmistakable FVG. A gate — false caps the grade at C. Null on
   * a trade logged before it was asked (it used to be an unused context pill,
   * so an old "no" could not be told from "never looked").
   */
  singular_gap: boolean | null;
  /**
   * Rubric 4 (trial). The swept level, picked from SWEEP_LEVELS — "Asia low".
   * Under rubric 4 a sweep with no level named is no sweep. Null before 018.
   */
  sweep_level: string | null;
  /** Rubric 4 (trial). The sweep also happened on NQ futures. Null = never checked. */
  sweep_futures_confirmed: boolean | null;
  /** Rubric 4 (trial). The HTF array price delivered from, picked — "5m FVG". Non-empty = delivered. */
  htf_delivery: string | null;
  /** The named target was reached before the stop. Null = not recorded. */
  target_hit: boolean | null;
  /** The target was untouched when the trade was taken. */
  target_fresh: boolean | null;
  /** The opposite side's liquidity was already taken that day. */
  opposite_taken: boolean | null;
  /** Management plan: 'A' all to final, 'B' partial at first liquidity. */
  mgmt_plan: 'A' | 'B' | null;
  /** Plan B: the kind of level the partial came off at (a target type). */
  partial_at: string | null;
  chk_displacement_fvg: ChecklistAnswer;
  chk_targets_clear: ChecklistAnswer;
  chk_clean_path: ChecklistAnswer;
  chk_returned_to_fvg: boolean;
  chk_inversion_close: boolean;
  /** Points earned, and points that applied. Generated. */
  checklist_earned: number;
  checklist_possible: number;
  /**
   * The grade, FROZEN under the rubric the trade was graded with (see
   * lib/rubric.ts). Every stat, chart and badge reads these three. They come
   * from score_at_entry / letter_at_entry / trigger_fired_at_entry, falling
   * back to the live columns only on a row that predates the snapshot.
   */
  checklist_score: number;
  trigger_fired: boolean;
  grade_letter: GradeLetter;
  /** The same three under the CURRENT rubric — SQLite's generated columns. For editing only. */
  live_score: number;
  live_trigger: boolean;
  live_letter: GradeLetter;
  /** Which rubric version froze the grade above. */
  rubric_version: number;
  /** Saved through "Log it fast", past the form's minimums. */
  quick_log: boolean;
  /** What went right — the mirror of mistake_tags. */
  worked_tags: WorkedTag[];
  /** What the market did — outside my control, never a rule break. */
  market_tags: MarketTag[];

  /**
   * What I said about my own discipline. Tri-state: null means the question
   * was never answered, which is different from "no" and must not be read as
   * "yes". Stats never use this directly — see lib/adherence.ts — it exists
   * only to measure the gap against what the checklist actually shows.
   */
  followed_rules: Tri;
  regrade: Regrade | null;
  /** The old single tag, kept so nothing written under the old taxonomy is lost. */
  mistake_tag: string | null;
  /** A bad trade usually has three. */
  mistake_tags: MistakeTag[];

  account: Account;
  account_label: string | null;

  status: TradeStatus;
  /**
   * The score before the outcome was known. Written by the server, never the
   * form: it follows the frozen score while the trade is Planned and is locked
   * with it the moment the trade leaves Planned (migration 015).
   */
  grade_at_entry: number | null;
  /** Logged in one shot after the fact. Hindsight grades cannot be pooled with pre-grades. */
  graded_post_hoc: boolean;

  /** Flag key -> why I dismissed it. See lib/flags.ts. */
  dismissed_flags: Record<string, string | null>;

  entry_price: number | null;
  take_profit: number | null;
  stop_loss: number | null;

  /** Execution, after the fact. All optional. */
  entry_time: string | null;
  exit_time: string | null;
  /** Worst excursion against the position, in R. Negative. */
  mae_r: number | null;
  /** Best excursion in favour, in R. */
  mfe_r: number | null;
  mae_points: number | null;
  mfe_points: number | null;
  /** If most losers touched +1R first, the problem is management, not selection. */
  reached_1r: boolean | null;

  /** 1-5, recorded before the outcome. Meaningless afterwards. */
  confidence_at_entry: number | null;

  /** What a passed setup would have paid. */
  would_be_r: number | null;

  playbook_id: string | null;

  /** Only meaningful when the outcome is 'Not taken'. */
  would_have_hit_tp: boolean | null;
  r_left_on_table: number | null;
  skip_reason: SkipReason | null;
  contracts: number | null;
  /** Never negative — P&L is risk x R, so a negative risk inverts every outcome. */
  risk_dollars: number | null;
  risk_percent: number | null;
  /** What the account actually did. Beats risk x R wherever it is set. */
  pnl_dollars: number | null;
  stop_points: number | null;
  outcome: Outcome;
  r_multiple: number | null;
  explanation: string;
  lesson: string | null;
  screenshot_path: string;
  position_x: number | null;
  position_y: number | null;
  /**
   * Logged past a promise on the Path or a daily limit, with the reason typed
   * at the time (migration 025). Empty on every trade that broke nothing.
   */
  overrides: TradeOverride[];
  /* --- Guardrails (026). All null on trades logged before them. --- */
  /** When the grade was locked. With graded_post_hoc false: before the outcome existed. */
  grade_locked_at: string | null;
  /** A backtest's replayed session (YYYY-MM-DD). Per-day rules use it. */
  chart_date: string | null;
  /** The nearest clear liquidity in my direction inside the dealing range. */
  nearest_liquidity_type: string | null;
  nearest_liquidity_price: number | null;
  opposing_swings_between: SwingCount | null;
  /** R from entry to that liquidity, from entry and stop. Computed. */
  r_to_nearest: number | null;
  /** Target is the nearest liquidity, no 2+ swings in the way, at least 1.5R. Null = not enough to tell. */
  target_check_passed: boolean | null;
  /** EQH/EQL by definition. */
  eqhl_checks: EqhlChecks | null;
  be_trigger: BeTrigger | null;
  /** Taken below the minimum confidence — a no-trade by my rules. Set by the server. */
  below_min_confidence: boolean | null;
  /** Missed only (027): written down before the move played out. Anything else is Hindsight. */
  written_before_outcome: boolean | null;
  /** R to the nearest liquidity, as a bucket (029). */
  r_to_nearest_bucket: RBucket | null;
  /** The management plan, which names the BE trigger (029). */
  management: Management | null;
  /** Soft delete. Nothing leaves without a second, deliberate act. */
  deleted_at: string | null;
  /** Why it was deleted — asked every time. Null unless it is in the Trash. */
  deleted_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** The three things that make a level an EQH/EQL by my definition. */
export interface EqhlChecks {
  /** Two or more touches within tolerance. */
  touches: boolean;
  /** Untested since. */
  untested: boolean;
  /** Inside the current dealing range. */
  in_range: boolean;
}

/** One promise or limit a trade was logged past, and why. */
export interface TradeOverride {
  kind: 'commitment_break' | 'daily_limit';
  step_id: string | null;
  step_title: string | null;
  commitment_id: string | null;
  commitment_text: string | null;
  /** In my own words, at least 40 characters. Null only if the server had to record it unexplained. */
  reason: string | null;
  at: string;
}

/** What the capture form sends. `id` and the generated columns are not yours to set. */
export type TradeInput = Omit<
  Trade,
  'id' | 'checklist_score' | 'checklist_earned' | 'checklist_possible'
  | 'trigger_fired' | 'grade_letter' | 'live_score' | 'live_trigger' | 'live_letter' | 'rubric_version'
  | 'created_at' | 'updated_at' | 'position_x' | 'position_y'
  | 'deleted_at' | 'deleted_reason' | 'dismissed_flags'
>;

export interface TradeShot {
  id: string;
  trade_id: string;
  path: string;
  slot: ShotSlot;
  ordinal: number;
}

export interface TradePartial {
  id: string;
  trade_id: string;
  size: number | null;
  price: number | null;
  r: number | null;
  ordinal: number;
}

export interface Playbook {
  id: string;
  name: string;
  criteria: string | null;
  reference_screenshot: string | null;
  archived_at: string | null;
  created_at: string;
}

/**
 * One per trading day, independent of whether anything was traded.
 *
 * Mood and sleep are here as correlation data, not as a diary — the point is
 * to plot adherence against them and find out whether five hours of sleep is
 * what actually breaks the rules.
 */
export interface DailyReview {
  day: string;
  account: string | null;
  bias: string | null;
  bias_screenshot: string | null;
  planned_killzones: string | null;
  planned_levels: string | null;
  what_happened: string | null;
  bias_held: boolean | null;
  trades_planned: number | null;
  screen_minutes: number | null;
  sleep_hours: number | null;
  state_of_mind: number | null;
  notes: string | null;
  /** Which way the morning read points. The `bias` text says why. */
  bias_direction: BiasDirection | null;
  /** What is on the economic calendar today. */
  news: NewsLevel | null;
  /** "CPI 8:30", "FOMC 14:00" — the event and when. */
  news_note: string | null;
  /** When the morning check-in was first saved. Set once, never rewritten. */
  checked_in_at: string | null;
  /** "Today I'm working on…" — the morning's one intention for the current Path step (025). */
  working_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeeklyReview {
  week_start: string;
  summary: string | null;
  reviewed_ids: string[];
  created_at: string;
}

export interface BoardNote {
  id: string;
  body: string;
  x: number;
  y: number;
  color: string | null;
  created_at: string;
}

export interface BoardEdge {
  id: string;
  from_id: string;
  to_id: string;
  label: string | null;
  created_at: string;
}

/** Informational only. Nothing reads these to decide whether a save is allowed. */
export interface RiskLimits {
  max_trades_per_day: number;
  daily_loss_limit_r: number;
  max_risk_per_trade_pct: number;
}

/** One field changing on one trade, at one moment. */
export interface TradeEdit {
  id: number;
  trade_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface FlagDismissal {
  trade_id: string;
  flag: FlagKey;
  reason: string | null;
  dismissed_at: string;
}

/** What a bulk edit is allowed to touch. Deliberately narrow. */
export interface BulkPatch {
  reason?: Reason;
  account?: Account;
  account_label?: string | null;
  mistake_tags?: MistakeTag[];
  status?: TradeStatus;
}

/** The quick-settle path: outcome and R, without reopening the whole form. */
export interface SettleInput {
  outcome: Outcome;
  r_multiple: number | null;
}

export interface TradeFilters {
  from?: string;
  to?: string;
  outcomes?: Outcome[];
  reasons?: Reason[];
  sessions?: Session[];
  minGrade?: number;
  maxGrade?: number;
  accounts?: Account[];
  statuses?: TradeStatus[];
  /** 'live' (default) hides soft-deleted rows; 'trash' shows only those. */
  bin?: 'live' | 'trash' | 'all';
}

/**
 * How much you have to write before a trade counts as recorded.
 *
 * Doubled from 80. Eighty characters is one sentence, and one sentence is a
 * label — "took the iFVG, it worked". A hundred and sixty forces a second
 * thought, and the second thought is the entire reason this file exists.
 *
 * Enforced in the app rather than in the schema. The database CHECK stays at
 * its original floor because trades already written under the old rule are
 * still true, and a stricter constraint would reject them on their next edit.
 */
export const MIN_EXPLANATION = 160;

/**
 * Same floor for the lesson, but only once the trade has an outcome.
 *
 * Demanding a lesson from a trade that has not happened yet is asking for
 * fiction, so a Planned entry is exempt until it settles.
 */
export const MIN_LESSON = 160;

/**
 * A movement of real money, or a statement of where the account actually is.
 *
 * `amount` is always a magnitude; the direction lives in `kind`. A reconcile
 * says "the broker shows exactly this on this date" and becomes the anchor the
 * balance is computed forward from — which is what makes the figure usable
 * while the P&L history behind it is still incomplete.
 */
export interface CashEvent {
  id: string;
  account: Account;
  kind: 'deposit' | 'withdrawal' | 'reconcile';
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

export const CASH_KINDS = ['deposit', 'withdrawal', 'reconcile'] as const;
export type CashKind = (typeof CASH_KINDS)[number];

/**
 * A page of the journal proper — writing with no trade attached.
 *
 * `body` is sanitised HTML; `plain` is the same content as text, stored
 * alongside so search does not strip tags at query time and a hit can be
 * shown as a readable snippet. `day` is a date, not a key: several pages on
 * one day is normal.
 */
export interface JournalPage {
  id: string;
  day: string;
  title: string;
  body: string;
  plain: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}
