import {
  ACCOUNT_VALUES, BACKTEST, CHECKLIST_ITEMS, signForOutcome, CONTEXT_FLAGS, DIRECTIONS, HTF_BIASES, INSTRUMENTS, MISTAKE_TAG_VALUES,
  OUTCOMES, PREMIUM_DISCOUNTS, REASONS, REGRADES, RENAMED_TARGET_TYPES, SESSIONS, SETUP_TYPES, SKIP_REASONS,
  SWEEP_TIERS, TARGET_TYPE_VALUES, TRADE_STATUSES, BE_TRIGGERS, SWING_COUNTS, WORKED_TAG_VALUES, MARKET_TAGS, MGMT_PLANS, PARTIAL_LEVELS,
  type ChecklistKey, type Regrade, type TradeStatus, type WorkedTag, type MarketTag, type ContextFlag, type MistakeTag, type Tri,
} from './domain';
import { REGRADE_HINT, regradeAllowed, type GradeLetter } from './grade';
import { CURRENT_RUBRIC, HTF_DELIVERIES, SWEEP_LEVELS, gradeUnder } from './rubric';
import { MIN_EXPLANATION, MIN_LESSON, type TradeInput } from './types';
import { sanitizeOverrides } from './overrides';

/**
 * Whose standard a piece of writing is held to.
 *
 * The minimums went up. Applied naively that makes every trade written under
 * the old rule impossible to save again — open one to correct its P&L and the
 * app refuses until you have written seventy more characters about a trade
 * from three weeks ago. That is the app becoming a gatekeeper over its own
 * history, which is the one thing it must never be.
 *
 * So the floor applies to what you write, not to what is already on record.
 * Pass `previous` on an edit: text that is byte-identical to what is stored
 * passes at any length, and the moment you change it the current floor
 * applies. Pass `restoring` for an import — those rows were authored once
 * already, under whatever rule was in force then, and a backup that will not
 * restore is not a backup.
 */
export interface WritingFloor {
  previous?: {
    explanation: string; lesson: string | null; quick_log?: boolean;
    /** The stored trade's stage, frozen letter and re-grade, for the grade-lock rules. */
    status?: TradeStatus; letter?: GradeLetter; regrade?: Regrade | null;
    /** Its stored date, kept when an undated backtest is edited without one. */
    date?: string;
  };
  restoring?: boolean;
}

/**
 * Validates a trade payload before it reaches SQLite. The CHECK constraints in
 * the schema are the real backstop — this exists so the UI gets a sentence it
 * can show instead of a constraint name.
 */
export function parseTradeInput(
  raw: unknown,
  floor: WritingFloor = {},
): { ok: true; value: TradeInput } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Malformed trade payload.' };
  const t = raw as Record<string, unknown>;

  const oneOf = <T extends string>(field: string, allowed: readonly T[]): T | null => {
    const v = t[field];
    return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  };
  const bool = (field: string) => t[field] === true;
  /**
   * Tri-state. Anything that is not an explicit true or false is unanswered —
   * which is the honest reading of a payload from an older client that never
   * had the question, and of a form the user did not touch.
   */
  const tri = (field: string): Tri => {
    const v = t[field];
    return v === true || v === false ? v : null;
  };
  const numOrNull = (field: string): number | null => {
    const v = t[field];
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const clamp = (n: number | null, lo: number, hi: number): number | null =>
    n == null ? null : Math.min(hi, Math.max(lo, Math.round(n)));

  /** Risk is a magnitude. A negative one silently turns every loss into a win. */
  const positiveOrNull = (field: string): number | null => {
    const n = numOrNull(field);
    return n == null || n < 0 ? null : n;
  };

  const reason = oneOf('reason', REASONS);
  if (!reason) return { ok: false, error: 'A reason is required — name why you took the trade.' };

  /** Text already on record, unchanged, is not being written now. */
  const asWritten = (value: string, before: string | null | undefined) =>
    floor.restoring === true || (before != null && value === before.trim());

  const explanation = typeof t.explanation === 'string' ? t.explanation.trim() : '';
  const lesson = typeof t.lesson === 'string' ? t.lesson.trim() : '';
  const planned = t.status === 'Planned';
  const lessonBefore = floor.previous ? (floor.previous.lesson ?? '') : undefined;
  const explanationShort = explanation.length < MIN_EXPLANATION
    && !asWritten(explanation, floor.previous?.explanation);
  const lessonShort = !planned && lesson.length < MIN_LESSON && !asWritten(lesson, lessonBefore);

  /*
    "Log it fast": whatever is written, saved as it is.

    The minimums are the form's standard for a full entry, and the full form
    keeps them. But a trade that never gets logged because the day was bad and
    the form asked for 160 characters is the worst outcome a journal has, so
    this path records anything — no minimum, no screenshot — and marks the
    record quick_log so stats can leave it out. An edit that brings a quick log
    up to the standard clears the mark; one that does not keeps it.
  */
  const screenshot_path = typeof t.screenshot_path === 'string' ? t.screenshot_path : '';
  const quick = t.quick_log === true
    || (floor.previous?.quick_log === true
      && (explanation.length < MIN_EXPLANATION || lesson.length < MIN_LESSON || !screenshot_path));

  if (!quick) {
    if (!explanation) return { ok: false, error: 'An explanation is required.' };
    if (explanationShort) {
      return { ok: false, error: `The explanation needs at least ${MIN_EXPLANATION} characters.` };
    }
    /*
      A lesson is required once the trade has a result to learn from. Planned
      entries are exempt: there is nothing to conclude yet, and a forced
      conclusion about a trade that has not happened is worse than none.
    */
    if (lessonShort) {
      return {
        ok: false,
        error: `The lesson needs at least ${MIN_LESSON} characters — what would you do differently?`,
      };
    }
  }

  // A new full entry needs its chart. An edit never does: refusing to save a
  // correction because a chart is missing would make the record unfixable.
  if (!screenshot_path && !quick && !floor.previous && !floor.restoring) {
    return { ok: false, error: 'A screenshot is required.' };
  }

  const instrument = oneOf('instrument', INSTRUMENTS);
  const direction = oneOf('direction', DIRECTIONS);
  const session = oneOf('session', SESSIONS);
  const setup_type = oneOf('setup_type', SETUP_TYPES);
  const htf_bias = oneOf('htf_bias', HTF_BIASES);
  const premium_discount = oneOf('premium_discount', PREMIUM_DISCOUNTS);
  // An older client or an older export may still use a name that was since
  // changed; it means the same target.
  if (typeof t.target_type === 'string' && RENAMED_TARGET_TYPES[t.target_type]) {
    t.target_type = RENAMED_TARGET_TYPES[t.target_type];
  }
  const target_type = oneOf('target_type', TARGET_TYPE_VALUES);
  const outcome = oneOf('outcome', OUTCOMES);

  const missing = Object.entries({
    instrument, direction, session, setup_type, htf_bias, premium_discount, target_type, outcome,
  }).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) return { ok: false, error: `Invalid or missing: ${missing.join(', ')}.` };

  /*
    A backtest can be undated: replayed from a chart months back, its day is
    not worth typing and a made-up one would be worse than none. `date` then
    holds when it was logged, and a missing one is filled with now rather
    than refused — no trade is ever turned away for want of a date. Any other
    account always has a real date, so `undated` is simply dropped there.
  */
  const account = oneOf('account', ACCOUNT_VALUES) ?? 'Live';
  const undated = account === BACKTEST && t.undated === true;
  const given = typeof t.date === 'string' && !Number.isNaN(new Date(t.date).getTime()) ? t.date : null;
  const date = given ?? (undated ? (floor.previous?.date ?? new Date().toISOString()) : null);
  if (!date) return { ok: false, error: 'Invalid date.' };

  /*
    The sweep tier and the single gap, rubric 2's gates.

    A restore of an export written before they existed carries rubric 1's
    MAJOR box and the old singular-gap pill instead, and reads them the way
    migration 015 read the rows already here: a ticked MAJOR box is a major
    sweep, anything else unknown; a ticked pill is a yes, an unticked one
    unknown — because that pill defaulted to off.
  */
  const beforeTiers = floor.restoring === true && !(typeof t.rubric_version === 'number' && t.rubric_version >= 2)
    && t.sweep_tier === undefined;
  const sweep_tier = oneOf('sweep_tier', SWEEP_TIERS) ?? (beforeTiers && t.chk_sweep === true ? 'major' : null);
  const singular_gap: Tri = beforeTiers ? (t.singular_gap === true ? true : null) : tri('singular_gap');
  // Rubric 1's box follows the tier, so a rubric-1 trade can still be graded under rubric 1.
  const chk_sweep: Tri = sweep_tier ? sweep_tier === 'major' : tri('chk_sweep');

  /*
    Rubric 4 (trial): the liquidity event, named — picked from fixed lists,
    so the trial's tables group cleanly. Anything else reads as not named
    (dropped, never refused), which is also what an older client means.
  */
  const sweep_level = oneOf('sweep_level', SWEEP_LEVELS);
  const htf_delivery = oneOf('htf_delivery', HTF_DELIVERIES);
  const sweep_futures_confirmed = tri('sweep_futures_confirmed');

  /*
    Targets and management (021). All optional. A partial level only means
    something under plan B, so it is dropped under any other plan.
  */
  const target_hit = tri('target_hit');
  const target_fresh = tri('target_fresh');
  const opposite_taken = tri('opposite_taken');
  const mgmt_plan = oneOf('mgmt_plan', MGMT_PLANS);
  const partial_at = mgmt_plan === 'B' ? oneOf('partial_at', PARTIAL_LEVELS) : null;

  const status = oneOf('status', TRADE_STATUSES) ?? 'Settled';
  const regrade = oneOf('regrade', REGRADES);
  const previous = floor.previous;
  if (!floor.restoring && previous?.status && previous.status !== 'Planned' && status === 'Planned') {
    return {
      ok: false,
      error: 'This trade has already left Planned, so its grade at entry is locked — it cannot go back to Planned.',
    };
  }

  const value: TradeInput = {
      date,
      instrument: instrument!, direction: direction!, session: session!,
      macro_time: bool('macro_time'), macro_time_auto: t.macro_time_auto !== false,
      reason, setup_type: setup_type!, htf_bias: htf_bias!,
      // Every context flag, read the same way. Anything absent is simply false,
      // which is what an older client or an older row means by omitting it.
      ...(Object.fromEntries(CONTEXT_FLAGS.map((f) => [f, bool(f)])) as Record<ContextFlag, boolean>),
      premium_discount: premium_discount!, target_type: target_type!,
      // Every checklist answer, read the same way; absent means false, which is
      // what an older client or an unanswered box means.
      /*
        Phase 1 and Phase 2 are tri-state; Phase 3 is not.

        `tri` keeps an explicit null as "did not apply". An older client that
        never had the third state sends true/false and is unaffected, and a
        payload missing the key entirely reads as null there — which for a box
        nobody answered is the honest reading, and is exactly what the form
        already sends for a fresh trade.
      */
      ...(Object.fromEntries(CHECKLIST_ITEMS.map(
        // A gate reads unanswered as unanswered — see singular_gap above.
        (item) => [item.key, item.canBeNA || item.gate ? tri(item.key) : bool(item.key)],
      )) as Pick<TradeInput, ChecklistKey>),
      singular_gap,
      sweep_tier,
      chk_sweep,
      sweep_level,
      sweep_futures_confirmed,
      htf_delivery,
      target_hit,
      target_fresh,
      opposite_taken,
      mgmt_plan,
      partial_at,
      followed_rules: tri('followed_rules'),
      regrade,
      // Legacy single tag. Nothing writes it any more; it is preserved so the
      // values saved under the old taxonomy are not silently erased on edit.
      mistake_tag: typeof t.mistake_tag === 'string' ? t.mistake_tag : null,
      mistake_tags: Array.isArray(t.mistake_tags)
        ? (t.mistake_tags.filter(
            (v): v is MistakeTag => typeof v === 'string' && (MISTAKE_TAG_VALUES as readonly string[]).includes(v),
          ))
        : [],
      account,
      undated,
      account_label: typeof t.account_label === 'string' && t.account_label.trim()
        ? t.account_label.trim() : null,
      status,
      grade_at_entry: numOrNull('grade_at_entry'),
      // Absent means it was written in one shot, after the fact — which is what
      // every trade logged from the plain form is.
      graded_post_hoc: t.graded_post_hoc !== false,
      entry_price: numOrNull('entry_price'),
      take_profit: numOrNull('take_profit'),
      stop_loss: numOrNull('stop_loss'),
      would_have_hit_tp: t.would_have_hit_tp == null ? null : t.would_have_hit_tp === true,
      r_left_on_table: numOrNull('r_left_on_table'),
      skip_reason: oneOf('skip_reason', SKIP_REASONS),
      entry_time: typeof t.entry_time === 'string' && t.entry_time ? t.entry_time : null,
      exit_time: typeof t.exit_time === 'string' && t.exit_time ? t.exit_time : null,
      mae_r: numOrNull('mae_r'),
      mfe_r: numOrNull('mfe_r'),
      mae_points: numOrNull('mae_points'),
      mfe_points: numOrNull('mfe_points'),
      reached_1r: t.reached_1r == null ? null : t.reached_1r === true,
      // Only meaningful before the outcome was known, so it is clamped rather
      // than rejected — an out-of-range value is a bug, not a reason to refuse
      // to save the trade it belongs to.
      confidence_at_entry: clamp(numOrNull('confidence_at_entry'), 1, 5),
      would_be_r: numOrNull('would_be_r'),
      playbook_id: typeof t.playbook_id === 'string' && t.playbook_id ? t.playbook_id : null,
      contracts: numOrNull('contracts'),
      // Clamped, not rejected — nothing here is allowed to refuse a save. A
      // negative risk is a typo for a percentage, and keeping it would invert
      // the P&L, so it is dropped rather than stored.
      risk_dollars: positiveOrNull('risk_dollars'),
      risk_percent: positiveOrNull('risk_percent'),
      // Signed, unlike risk: a loss is a negative number here — made so if it
      // was typed positive (domain.ts signForOutcome).
      pnl_dollars: signForOutcome(numOrNull('pnl_dollars'), outcome!),
      stop_points: numOrNull('stop_points'),
      outcome: outcome!,
      r_multiple: signForOutcome(numOrNull('r_multiple'), outcome!),
      explanation,
      lesson: lesson || null,
      screenshot_path,
      quick_log: quick,
      worked_tags: Array.isArray(t.worked_tags)
        ? t.worked_tags.filter(
            (v): v is WorkedTag => typeof v === 'string' && (WORKED_TAG_VALUES as readonly string[]).includes(v),
          )
        : [],
      market_tags: Array.isArray(t.market_tags)
        ? t.market_tags.filter(
            (v): v is MarketTag => typeof v === 'string' && (MARKET_TAGS as readonly string[]).includes(v),
          )
        : [],
      overrides: sanitizeOverrides(t.overrides),
      // Guardrails (026). The server settles the lock time, the R and the
      // verdict itself (db/rules.ts); what arrives here is only kept as given.
      grade_locked_at: typeof t.grade_locked_at === 'string' ? t.grade_locked_at : null,
      chart_date: typeof t.chart_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.chart_date) ? t.chart_date : null,
      nearest_liquidity_type: typeof t.nearest_liquidity_type === 'string' && t.nearest_liquidity_type.trim()
        ? t.nearest_liquidity_type.trim().slice(0, 60) : null,
      nearest_liquidity_price: numOrNull('nearest_liquidity_price'),
      opposing_swings_between: oneOf('opposing_swings_between', SWING_COUNTS),
      r_to_nearest: numOrNull('r_to_nearest'),
      target_check_passed: tri('target_check_passed'),
      eqhl_checks: t.eqhl_checks && typeof t.eqhl_checks === 'object'
        ? (() => { const e = t.eqhl_checks as Record<string, unknown>; return { touches: e.touches === true, untested: e.untested === true, in_range: e.in_range === true }; })()
        : null,
      be_trigger: oneOf('be_trigger', BE_TRIGGERS),
      below_min_confidence: tri('below_min_confidence'),
  };

  /*
    Reviews can only be harsher. The re-grade is checked against the grade
    at entry: the locked one if the trade has left Planned, otherwise the one
    these answers get now. A re-grade already on record passes unchanged, so
    a trade re-graded before this rule existed stays saveable.
  */
  if (regrade && !floor.restoring && regrade !== previous?.regrade) {
    const entry = previous?.status && previous.status !== 'Planned' && previous.letter
      ? previous.letter
      : gradeUnder(CURRENT_RUBRIC, value).letter;
    if (!regradeAllowed(entry, regrade)) {
      return {
        ok: false,
        error: `The grade at entry is ${entry}, so the re-grade can be ${entry} or lower — never higher. ${REGRADE_HINT}`,
      };
    }
  }

  return { ok: true, value };
}
