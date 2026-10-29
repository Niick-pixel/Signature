/**
 * My written rules, as data.
 *
 * Each rule is the sentence I would say out loud and a test over fields the
 * trade already has. A test answers true (kept), false (broken) or null (it
 * cannot tell — the field was never answered), and null is never counted as
 * broken: silence is not evidence.
 *
 * Trade rules look at one trade. Day rules look at one day's real trades in
 * the order they happened. Backtests keep only their log time and have no
 * day, so day rules never apply to them; Missed trades were not taken and
 * break nothing.
 *
 * Nothing here blocks anything. Broken rules are listed after the fact
 * (lib/review.ts), never used to refuse a save.
 */
import { RETIRED_TARGET_TYPES, TAKE_IT_THRESHOLD, isBacktest, isHypothetical, isScored, isTaken } from './domain';
import { GATES_SINCE } from './rubric';
import type { Trade } from './types';

/** Target types that are not a named pool: "Other" and the retired ones — except the horizontal pool, which still is. */
const NOT_NAMED: readonly string[] = RETIRED_TARGET_TYPES.filter((t) => t !== 'Horizontal liquidity pool');

export interface RuleConfig {
  /** Minimum R to the target for the R rule. */
  minR: number;
  /** Losses after which the day is done (the "stop after" setting, or that morning's prep). */
  maxLosses: number;
  /** Minutes to wait after a loss before the next trade. */
  cooldownMinutes: number;
  /** Trades allowed per day (or replay session). */
  maxTrades: number;
  /** Risk per trade, % of the account, when the trade records it. */
  maxRiskPct: number;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = { minR: 1.5, maxLosses: 2, cooldownMinutes: 10, maxTrades: 2, maxRiskPct: 1 };

export type Verdict = boolean | null;

export interface TradeRule {
  id: string;
  scope: 'trade';
  text: string;
  /** Short label, for a chip. */
  short: string;
  test: (t: Trade, cfg: RuleConfig) => Verdict;
  /**
   * 'logging' rules are about the journal being complete (max R logged, the
   * management plan recorded), not about the trade: they show where they
   * always did, but never count as breaking the plan (lib/edge/metrics adherence).
   */
  kind?: 'trading' | 'logging';
  /**
   * Whether the trade answered the field this rule reads. A trade logged
   * before the first one that ever did predates the question, so the rule
   * says nothing about it (see lib/review fieldEras) — a field the form did
   * not ask yet cannot have been skipped.
   */
  answered?: (t: Trade) => boolean;
}

/** What a day rule needs to know beyond the trades: the news that day. */
export interface DayContext {
  /** A red-folder (high-impact) day, from the morning check-in. */
  redFolder?: boolean;
  maxLosses?: number;
  /** The first Friday of the month with no news calendar for that day: very likely NFP. */
  nfpGuess?: boolean;
  /** A replay session rather than a market day: no clock times, no news. */
  backtest?: boolean;
}

export interface DayRule {
  id: string;
  scope: 'day';
  text: string;
  short: string;
  /** The ids of the trades that broke it, given the day's trades in order. */
  broken: (day: Trade[], cfg: RuleConfig, ctx: DayContext) => string[];
}

export type Rule = TradeRule | DayRule;

/** R to the target from what the form records: the bucket, or the R computed from prices on older trades. */
export function plannedR(t: Trade): { lo: number; hi: number } | null {
  switch (t.r_to_nearest_bucket) {
    case '<1': return { lo: 0, hi: 1 };
    case '1-1.5': return { lo: 1, hi: 1.5 };
    case '1.5-2': return { lo: 1.5, hi: 2 };
    case '2+': return { lo: 2, hi: Infinity };
    default: return t.r_to_nearest != null ? { lo: t.r_to_nearest, hi: t.r_to_nearest } : null;
  }
}

export const TRADE_RULES: TradeRule[] = [
  {
    id: 'sweep', scope: 'trade', short: 'Named sweep first',
    text: 'A named level is swept before the entry.',
    test: (t) => (t.sweep_tier == null ? null : t.sweep_tier !== 'none'),
  },
  {
    id: 'inversion', scope: 'trade', short: 'Inversion close',
    text: 'The inversion candle closes through the FVG before I enter.',
    test: (t) => t.trigger_fired,
  },
  {
    id: 'named-target', scope: 'trade', short: 'Named pool target',
    text: 'The target is a named pool — not "Other", not a retired type (a horizontal liquidity pool still counts).',
    test: (t) => (t.target_type ? !NOT_NAMED.includes(t.target_type) : null),
  },
  {
    id: 'min-r', scope: 'trade', short: 'Enough R',
    text: 'The nearest liquidity is at least the minimum R away.',
    test: (t, cfg) => {
      const r = plannedR(t);
      if (!r) return null;
      if (r.lo >= cfg.minR) return true;
      // Buckets are [lo, hi): 1.5–2 is under a 2R minimum.
      if (r.hi <= cfg.minR) return false;
      // A bucket that straddles the minimum (1.5–2 against 1.75) cannot tell.
      return null;
    },
  },
  {
    id: 'pd', scope: 'trade', short: 'Right side of the range',
    text: 'No longs from premium, no shorts from discount. Equilibrium is fine when the setup is valid.',
    test: (t) => {
      if (!t.premium_discount) return null;
      return t.direction === 'Long' ? t.premium_discount !== 'Premium' : t.premium_discount !== 'Discount';
    },
  },
  {
    id: 'killzone', scope: 'trade', short: 'Inside the killzone',
    text: 'Entered inside the killzone.',
    test: (t) => (t.chk_killzone == null ? null : t.chk_killzone),
  },
  {
    id: 'threshold', scope: 'trade', short: 'Checklist at the threshold',
    text: `The checklist scored at least ${TAKE_IT_THRESHOLD} before the entry.`,
    test: (t) => (isScored(t) ? t.checklist_score >= TAKE_IT_THRESHOLD : null),
  },
  {
    // The model gate is "a named sweep AND one clean gap"; the sweep half is the rule above.
    id: 'one-gap', scope: 'trade', short: 'One clean gap',
    text: 'One clean gap, not overlapping ones — the model (rubric 2 and later).',
    test: (t) => ((t.rubric_version ?? 1) >= GATES_SINCE && t.singular_gap != null ? t.singular_gap : null),
  },
  {
    id: 'min-confidence', scope: 'trade', short: 'Confidence at the minimum',
    text: 'Taken at or above the minimum confidence.',
    test: (t) => (t.below_min_confidence == null ? null : !t.below_min_confidence),
  },
  {
    id: 'eq-pool', scope: 'trade', short: 'Not into an EQ pool',
    text: 'No long into EQH, no short into EQL.',
    test: (t) => (t.into_eq_pool == null ? null : !t.into_eq_pool),
  },
  {
    id: 'risk', scope: 'trade', short: 'Risk within 1%',
    text: 'Risk per trade at or under 1% of the account.',
    test: (t, cfg) => (t.risk_percent == null ? null : t.risk_percent <= cfg.maxRiskPct),
  },
  {
    id: 'management', scope: 'trade', short: 'Management plan set', kind: 'logging',
    text: 'The management plan is decided and recorded.',
    test: (t) => t.management != null || t.mgmt_plan != null,
    answered: (t) => t.management != null || t.mgmt_plan != null,
  },
  {
    id: 'max-r', scope: 'trade', short: 'Max R logged', kind: 'logging',
    text: 'How far it ran (max R reached) is logged.',
    test: (t) => t.mfe_r != null,
    answered: (t) => t.mfe_r != null,
  },
];

/** Minutes between two trades' times ('YYYY-MM-DDTHH:mm', local). */
const minutes = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;
/** When a trade's loss was known: its exit time when recorded (HH:mm on the same day), else its entry. */
export function lossKnownAt(t: Trade): string {
  return t.exit_time && /^\d{2}:\d{2}/.test(t.exit_time) ? `${t.date.slice(0, 10)}T${t.exit_time.slice(0, 5)}` : t.date;
}

/**
 * The trades taken after `max` losses in a row, in one day's (or session's)
 * order. A win or breakeven resets the run. The one definition of "stop
 * after N losses" — the day rule, the plan grade and goals all use it.
 */
export function afterLossStop<T extends Pick<Trade, 'id' | 'outcome' | 'r_multiple'>>(day: readonly T[], max: number): T[] {
  if (max <= 0) return [];
  let run = 0; let stopped = false;
  const out: T[] = [];
  for (const t of day) {
    if (stopped) { out.push(t); continue; }
    const loss = t.r_multiple != null ? t.r_multiple < -0.1 : t.outcome === 'Loss';
    run = loss ? run + 1 : 0;
    if (run >= max) stopped = true;
  }
  return out;
}

/** The first Friday of its month (local 'YYYY-MM-DD'). */
export function isFirstFriday(day: string): boolean {
  const d = new Date(`${day}T12:00:00Z`);
  return d.getUTCDay() === 5 && d.getUTCDate() <= 7;
}

export const DAY_RULES: DayRule[] = [
  {
    id: 'max-trades', scope: 'day', short: 'At most 2 trades',
    text: 'At most 2 trades a day (or replay session).',
    broken: (day, cfg) => (cfg.maxTrades > 0 ? day.slice(cfg.maxTrades).map((t) => t.id) : []),
  },
  {
    id: 'stop-after-losses', scope: 'day', short: 'Done after 2 losses in a row',
    text: 'No trade after 2 losses in a row.',
    broken: (day, cfg, ctx) => afterLossStop(day, ctx.maxLosses ?? cfg.maxLosses).map((t) => t.id),
  },
  {
    id: 'cooldown', scope: 'day', short: '10 minutes after a loss',
    text: 'No trade within 10 minutes after a loss.',
    broken: (day, cfg, ctx) => {
      // A replay has no clock: its times are when it was logged.
      if (ctx.backtest) return [];
      const out: string[] = [];
      for (let i = 1; i < day.length; i++) {
        const prev = day[i - 1];
        if (prev.outcome !== 'Loss') continue;
        const gap = minutes(lossKnownAt(prev), day[i].date);
        if (gap >= 0 && gap < cfg.cooldownMinutes) out.push(day[i].id);
      }
      return out;
    },
  },
  {
    id: 'news-day', scope: 'day', short: 'No red-folder day',
    text: 'No trade on a red-folder (NFP / FOMC / CPI) day.',
    broken: (day, _cfg, ctx) => {
      if (ctx.backtest) return [];
      // The morning check-in or the news calendar said high-impact news, a
      // trade's own checklist said there was a conflict, or it is the first
      // Friday with no calendar for the day — NFP, nearly always.
      const conflict = ctx.redFolder === true || ctx.nfpGuess === true || day.some((t) => t.chk_no_news === false);
      return conflict ? day.map((t) => t.id) : [];
    },
  },
];

export const RULES: Rule[] = [...TRADE_RULES, ...DAY_RULES];

/** A trade the rules are about: taken for real (not Missed, not a pass). Planned trades are checked too — before the fact. */
export const checkable = (t: Trade) => !t.deleted_at && !isHypothetical(t.account) && (isTaken(t.outcome) || t.status === 'Planned');

/**
 * Trades a day rule can see: taken, and either a real trade with a date or a
 * backtest with a replay session (backtests have no market date; the session
 * stands in for the day).
 */
export const dayCheckable = (t: Trade) => checkable(t) && isTaken(t.outcome) && t.status !== 'Planned'
  && (isBacktest(t.account) ? t.session_index != null : !t.undated);

/** The key day rules group by: the date for a real trade, the replay session for a backtest. */
export const dayKey = (t: Trade): string | null => (!dayCheckable(t) ? null : isBacktest(t.account) ? `session:${t.session_index}` : t.date.slice(0, 10));
export const isSessionKey = (k: string) => k.startsWith('session:');
