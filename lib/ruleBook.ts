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
import { RETIRED_TARGET_TYPES, isBacktest, isHypothetical, isTaken } from './domain';
import type { Trade } from './types';

export interface RuleConfig {
  /** Minimum R to the target for the R rule. */
  minR: number;
  /** Losses after which the day is done (the "stop after" setting, or that morning's prep). */
  maxLosses: number;
  /** Minutes to wait after a loss before the next trade. */
  cooldownMinutes: number;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = { minR: 2, maxLosses: 2, cooldownMinutes: 10 };

export type Verdict = boolean | null;

export interface TradeRule {
  id: string;
  scope: 'trade';
  text: string;
  /** Short label, for a chip. */
  short: string;
  test: (t: Trade, cfg: RuleConfig) => Verdict;
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
  /** The morning's prep said the news falls inside the killzone. */
  newsInKillzone?: boolean;
  maxLosses?: number;
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
    text: 'The target is a named pool from the current list — not "Other", not a retired type.',
    test: (t) => (t.target_type ? !(RETIRED_TARGET_TYPES as readonly string[]).includes(t.target_type) : null),
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
    id: 'pd', scope: 'trade', short: 'Discount long / premium short',
    text: 'Longs from discount, shorts from premium.',
    test: (t) => {
      if (!t.premium_discount) return null;
      return t.direction === 'Long' ? t.premium_discount === 'Discount' : t.premium_discount === 'Premium';
    },
  },
  {
    id: 'killzone', scope: 'trade', short: 'Inside the killzone',
    text: 'Entered inside the killzone.',
    test: (t) => (t.chk_killzone == null ? null : t.chk_killzone),
  },
  {
    id: 'management', scope: 'trade', short: 'Management plan set',
    text: 'The management plan is decided and recorded.',
    test: (t) => t.management != null || t.mgmt_plan != null,
    answered: (t) => t.management != null || t.mgmt_plan != null,
  },
  {
    id: 'max-r', scope: 'trade', short: 'Max R logged',
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

export const DAY_RULES: DayRule[] = [
  {
    id: 'stop-after-losses', scope: 'day', short: 'Done after 2 losses',
    text: 'No trade after the 2nd loss of the day.',
    broken: (day, cfg, ctx) => {
      const max = ctx.maxLosses ?? cfg.maxLosses;
      if (max <= 0) return [];
      let losses = 0;
      const out: string[] = [];
      for (const t of day) {
        if (losses >= max) out.push(t.id);
        if (t.outcome === 'Loss') losses += 1;
      }
      return out;
    },
  },
  {
    id: 'cooldown', scope: 'day', short: '10 minutes after a loss',
    text: 'No trade within 10 minutes after a loss.',
    broken: (day, cfg) => {
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
    id: 'news-day', scope: 'day', short: 'No news-conflict day',
    text: 'No trade on a day the news conflicts with the session.',
    broken: (day, _cfg, ctx) => {
      // The prep said the news falls inside the killzone, or the trade's own
      // checklist said there was an NFP / FOMC / CPI conflict.
      const conflict = ctx.newsInKillzone === true || day.some((t) => t.chk_no_news === false);
      return conflict ? day.map((t) => t.id) : [];
    },
  },
];

export const RULES: Rule[] = [...TRADE_RULES, ...DAY_RULES];

/** A trade the rules are about: taken for real (not Missed, not a pass). Planned trades are checked too — before the fact. */
export const checkable = (t: Trade) => !t.deleted_at && !isHypothetical(t.account) && (isTaken(t.outcome) || t.status === 'Planned');

/** Trades a day rule can see: real, taken, dated, not a backtest. */
export const dayCheckable = (t: Trade) => checkable(t) && isTaken(t.outcome) && t.status !== 'Planned' && !isBacktest(t.account) && !t.undated;
