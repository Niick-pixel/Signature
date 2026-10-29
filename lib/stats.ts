import {
  ACCOUNT_VALUES, accountLabel, isDated, isHypothetical, isReal, isSeparate, CHECKLIST_ITEMS, CONFIDENCE_LEVELS, GRADE_BANDS, MIN_SAMPLE, REASONS,
  RETIRED_TARGET_TYPES, SKIP_REASONS, SWEEP_TIERS, SWEEP_TIER_SPEC, TAKE_IT_THRESHOLD, TARGET_TYPES,
  TARGET_CLASSES, TARGET_TYPE_VALUES, isTaken, targetClassOf,
  type Account, type ChecklistKey, type MistakeTag, type Reason, type SkipReason,
  type TargetType,
} from './domain';
import { adherenceGap, adherenceOf, derivedAdherence, type AdherenceGap } from './adherence';
import { resultClass } from './edge/metrics';
import { GRADE_BUCKETS, GRADE_LETTERS } from './grade';
import { TRIAL_SAMPLE, trialEventOf } from './rubric';
export { trialEventOf };
import { localDay } from './day';
import { isMacroTime } from './macro';
import type { Trade } from './types';

/**
 * The one rule that governs every number in this file: a 'Not taken' trade is
 * journalled and clustered, but it never touches R or win rate. You didn't risk
 * money, so it can't have made or lost any. It is reported as its own count.
 */
export interface Aggregate {
  /** Every trade in the group, passed ones included. */
  count: number;
  /** Trades actually taken — the denominator for winRate and totalR. */
  taken: number;
  /** Setups seen and deliberately not traded. */
  passed: number;
  wins: number;
  losses: number;
  breakeven: number;
  scratched: number;
  /** Wins / (wins + losses). Null when nothing has been settled yet. */
  winRate: number | null;
  totalR: number;
  avgR: number | null;
  /** Averaged across every trade in the group, passed ones included — a passed
   *  A+ setup is still evidence about how you grade. */
  avgGrade: number | null;
}

/**
 * Money, derived rather than stored.
 *
 * A trade records what it risked and what it returned in R, so dollars are
 * risk_dollars x r_multiple. Trades with no risk recorded contribute nothing
 * to the money figures but still count everywhere else — which is why the
 * dollar totals carry their own `priced` count, so a half-filled journal
 * cannot quietly look like a small one.
 */
export interface Money {
  /** Trades with a money figure at all, recorded or derived. */
  priced: number;
  /** Of those, how many were computed from risk x R rather than recorded. */
  derived: number;
  won: number;
  lost: number;
  net: number;
  totalRisked: number;
  biggestWin: number;
  biggestLoss: number;
}

/**
 * What one trade did to the account, in money.
 *
 * A recorded figure always wins. Falling back to risk x R is an estimate
 * multiplied by an estimate, and it is not bounded by the risk — losing 2R on
 * $2.50 really is a $5 loss, which reads like the app inflating the number
 * when it is actually saying "you lost twice what you meant to". True, useful,
 * and still not a substitute for the number on the statement.
 */
export function pnlOf(t: Trade): number | null {
  if (t.pnl_dollars != null) return t.pnl_dollars;
  if (t.risk_dollars == null || t.r_multiple == null) return null;
  return t.risk_dollars * t.r_multiple;
}

export function money(trades: Trade[]): Money {
  let won = 0;
  let lost = 0;
  let totalRisked = 0;
  let priced = 0;
  let derived = 0;
  let biggestWin = 0;
  let biggestLoss = 0;

  for (const t of trades) {
    if (!isTaken(t.outcome)) continue;
    const pnl = pnlOf(t);
    if (pnl == null) continue;

    priced += 1;
    if (t.pnl_dollars == null) derived += 1;
    totalRisked += t.risk_dollars ?? 0;

    if (pnl >= 0) {
      won += pnl;
      biggestWin = Math.max(biggestWin, pnl);
    } else {
      lost += Math.abs(pnl);
      biggestLoss = Math.max(biggestLoss, Math.abs(pnl));
    }
  }

  return { priced, derived, won, lost, net: won - lost, totalRisked, biggestWin, biggestLoss };
}

export interface Edge {
  /** Sum of every positive R. */
  rWon: number;
  /** Sum of every negative R, as a positive number. */
  rLost: number;
  avgWinR: number | null;
  avgLossR: number | null;
  /** Average R per trade taken — the number that decides whether this works. */
  expectancy: number | null;
  /** Gross R won divided by gross R lost. Above 1 is a living. */
  profitFactor: number | null;
  bestR: number | null;
  worstR: number | null;
  longestWinStreak: number;
  longestLossStreak: number;
}

export function edge(trades: Trade[]): Edge {
  const taken = trades.filter((t) => isTaken(t.outcome) && t.r_multiple != null);
  // Result classes come from R (lib/edge/metrics): a +0.05R "breakeven" is not a win.
  const wins = taken.filter((t) => resultClass(t.r_multiple as number) === 'W');
  const losses = taken.filter((t) => resultClass(t.r_multiple as number) === 'L');

  // Profit factor's sums take every positive and negative R, small breakevens included.
  const rWon = taken.filter((t) => (t.r_multiple as number) > 0).reduce((sum, t) => sum + (t.r_multiple as number), 0);
  const rLost = Math.abs(taken.filter((t) => (t.r_multiple as number) < 0).reduce((sum, t) => sum + (t.r_multiple as number), 0));
  const winsR = wins.reduce((sum, t) => sum + (t.r_multiple as number), 0);
  const lossesR = Math.abs(losses.reduce((sum, t) => sum + (t.r_multiple as number), 0));

  // Streaks run in the order the trades happened, oldest first.
  const chronological = [...taken].sort((a, b) => a.date.localeCompare(b.date));
  let winStreak = 0;
  let lossStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  for (const t of chronological) {
    const c = resultClass(t.r_multiple as number);
    if (c === 'W') {
      winStreak += 1; lossStreak = 0;
      longestWinStreak = Math.max(longestWinStreak, winStreak);
    } else if (c === 'L') {
      lossStreak += 1; winStreak = 0;
      longestLossStreak = Math.max(longestLossStreak, lossStreak);
    } else {
      winStreak = 0; lossStreak = 0;
    }
  }

  const rs = taken.map((t) => t.r_multiple as number);
  return {
    rWon,
    rLost,
    avgWinR: wins.length ? winsR / wins.length : null,
    avgLossR: losses.length ? lossesR / losses.length : null,
    expectancy: taken.length ? (rWon - rLost) / taken.length : null,
    profitFactor: rLost > 0 ? rWon / rLost : null,
    bestR: rs.length ? Math.max(...rs) : null,
    worstR: rs.length ? Math.min(...rs) : null,
    longestWinStreak,
    longestLossStreak,
  };
}

export function aggregate(trades: Trade[]): Aggregate {
  const taken = trades.filter((t) => isTaken(t.outcome));
  // By R where there is one (lib/edge/metrics), by the label only where R was never recorded.
  const cls = (t: Trade) => (t.r_multiple != null ? resultClass(t.r_multiple)
    : t.outcome === 'Win' ? 'W' : t.outcome === 'Loss' ? 'L' : t.outcome === 'Breakeven' ? 'BE' : 'S');
  const wins = taken.filter((t) => cls(t) === 'W').length;
  const losses = taken.filter((t) => cls(t) === 'L').length;
  const decided = wins + losses;
  const totalR = taken.reduce((sum, t) => sum + (t.r_multiple ?? 0), 0);

  return {
    count: trades.length,
    taken: taken.length,
    passed: trades.length - taken.length,
    wins,
    losses,
    breakeven: taken.filter((t) => cls(t) === 'BE').length,
    scratched: taken.filter((t) => cls(t) === 'S').length,
    winRate: decided ? wins / decided : null,
    totalR,
    avgR: taken.length ? totalR / taken.length : null,
    avgGrade: trades.length ? trades.reduce((s, t) => s + t.checklist_score, 0) / trades.length : null,
  };
}

function groupBy<K extends string>(trades: Trade[], key: (t: Trade) => K, keys: readonly K[]) {
  const buckets = new Map<K, Trade[]>(keys.map((k) => [k, []]));
  for (const t of trades) buckets.get(key(t))?.push(t);
  return buckets;
}

export interface Group<K> {
  key: K;
  trades: Trade[];
  stats: Aggregate;
}

/** Clusters for the whiteboard. Empty reasons are dropped — no ghost regions. */
export function byReason(trades: Trade[]): Group<Reason>[] {
  return [...groupBy(trades, (t) => t.reason, REASONS)]
    .filter(([, ts]) => ts.length > 0)
    .map(([key, ts]) => ({ key, trades: ts, stats: aggregate(ts) }));
}

/** Sorted worst-first: the leak you most need to see goes at the top. */
export function rByReason(trades: Trade[]): Group<Reason>[] {
  return byReason(trades).sort((a, b) => a.stats.totalR - b.stats.totalR);
}

export function rByTargetType(trades: Trade[]): Group<TargetType>[] {
  return [...groupBy(trades, (t) => t.target_type, TARGET_TYPE_VALUES)]
    .filter(([, ts]) => ts.length > 0)
    .map(([key, ts]) => ({ key, trades: ts, stats: aggregate(ts) }))
    .sort((a, b) => a.stats.totalR - b.stats.totalR);
}

/** Does the grading actually predict outcomes? */
export function byGradeBucket(trades: Trade[]): Group<string>[] {
  return GRADE_BUCKETS.map((bucket) => {
    // By the letter the trade was given, not by re-banding its score under
    // today's thresholds — see lib/rubric.ts.
    const ts = trades.filter((t) => t.grade_letter === bucket.label);
    return { key: bucket.label as string, trades: ts, stats: aggregate(ts) };
  }).filter((g) => g.trades.length > 0);
}

/** Generic grouping by any string field, dropping empty buckets. */
export function groupByField<K extends string>(
  trades: Trade[],
  key: (t: Trade) => K,
  keys: readonly K[],
): Group<K>[] {
  return [...groupBy(trades, key, keys)]
    .filter(([, ts]) => ts.length > 0)
    .map(([k, ts]) => ({ key: k, trades: ts, stats: aggregate(ts) }));
}

/**
 * What is actually costing you: reasons ranked by total R lost, counting only
 * the losing trades. Distinct from "R by reason", which nets wins against
 * losses and can hide a reason that both makes and loses a great deal.
 */
export function losingReasons(trades: Trade[]): Array<{ reason: Reason; losses: number; rLost: number }> {
  const out = new Map<Reason, { losses: number; rLost: number }>();
  for (const t of trades) {
    if (t.outcome !== 'Loss') continue;
    const entry = out.get(t.reason) ?? { losses: 0, rLost: 0 };
    entry.losses += 1;
    entry.rLost += Math.abs(t.r_multiple ?? 0);
    out.set(t.reason, entry);
  }
  return [...out]
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => b.rLost - a.rLost || b.losses - a.losses);
}

export function byMacroTime(trades: Trade[]): Group<'Inside macro' | 'Outside macro'>[] {
  // An undated backtest has no entry time, so it was neither inside nor outside.
  const timed = trades.filter(isDated);
  const inside = timed.filter((t) => t.macro_time);
  const outside = timed.filter((t) => !t.macro_time);
  return [
    { key: 'Inside macro' as const, trades: inside, stats: aggregate(inside) },
    { key: 'Outside macro' as const, trades: outside, stats: aggregate(outside) },
  ].filter((g) => g.trades.length > 0);
}

/**
 * Repeating leaks: two trades that share a target type and both lost. These get
 * a dashed edge on the whiteboard so the pattern shows up as a physical line.
 */
export function leakPairs(trades: Trade[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const losses = trades.filter((t) => t.outcome === 'Loss');
  for (const targetType of TARGET_TYPES) {
    const group = losses.filter((t) => t.target_type === targetType);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) pairs.push([group[i].id, group[j].id]);
    }
  }
  return pairs;
}

export { isMacroTime };

/* ------------------------------------------------------------------ *
 * The plan's own questions.
 *
 * Everything above measures the market. These measure you: whether you
 * followed the rules, whether you graded honestly, and what the setups you
 * talked yourself out of would have paid.
 * ------------------------------------------------------------------ */

/**
 * Rule-following against rule-breaking, in R.
 *
 * The plan's premise is that the edge is in the rules rather than in the
 * picks. If broken-rule trades net positive, that premise is being tested by
 * the market and needs an answer — not ignored because the money was good.
 */
export interface Discipline {
  followed: Aggregate;
  broken: Aggregate;
  /** R given up by the trades where a rule was broken. Negative is a cost. */
  costOfBreaking: number;
  /** Taken without both Phase 3 answers — entries the plan says don't exist. */
  untriggered: Aggregate;
  /** Checklist never filled in. Neither followed nor broken — just unknown. */
  unscored: Aggregate;
  /** What I claimed against what the record shows. */
  gap: AdherenceGap;
  /** Share of trades where the derived answer is true. Null with no trades. */
  adherenceRate: number | null;
}

export function discipline(trades: Trade[]): Discipline {
  /*
    Derived, not self-reported — but only where there is something to derive
    from. A trade whose checklist was never filled in is reported as unscored
    rather than counted as a break: calling it one would assert something about
    my behaviour from the absence of data, which is the same mistake as the
    form defaulting "followed all rules" to yes.
  */
  const followed = trades.filter((t) => adherenceOf(t) === 'followed');
  const broken = trades.filter((t) => adherenceOf(t) === 'broken');
  const unscored = trades.filter((t) => adherenceOf(t) === 'unscored');
  const untriggered = trades.filter((t) => isTaken(t.outcome) && !t.trigger_fired);

  return {
    followed: aggregate(followed),
    broken: aggregate(broken),
    costOfBreaking: aggregate(broken).totalR,
    untriggered: aggregate(untriggered),
    unscored: aggregate(unscored),
    gap: adherenceGap(trades),
    // Out of the trades that actually have a verdict. Including unscored ones
    // in the denominator would make the headline fall every time I logged a
    // trade quickly, which is precisely the behaviour worth encouraging.
    adherenceRate: (followed.length + broken.length)
      ? followed.length / (followed.length + broken.length)
      : null,
  };
}

/**
 * Letters on one scale, so the grade given at entry and the re-grade given
 * after the close can be compared. The entry grade only ever produces A+, A,
 * B, C or F; the re-grade is allowed the finer steps in between.
 */
const GRADE_RANK: Record<string, number> = {
  'A+': 8, A: 7, 'A-': 6, 'B+': 5, B: 4, 'B-': 3, C: 2, F: 1,
};

/**
 * Grade inflation: did you talk the setup up before the entry?
 *
 * A trade re-graded below the score the checklist gave it means the boxes were
 * ticked to reach a number rather than because they were true. One is a bad
 * day; a pattern of it means the checklist is being used as permission.
 */
export interface GradeHonesty {
  /** Trades that have been re-graded at all. */
  regraded: number;
  /** Re-graded below the entry grade — the checklist was flattered. */
  inflated: number;
  /** Re-graded above it. */
  understated: number;
  matched: number;
  /** Average letters of drop, over the re-graded trades. Positive is inflation. */
  averageDrop: number | null;
  /** The worst offenders, most-inflated first. */
  worst: Array<{ trade: Trade; from: string; to: string; drop: number }>;
}

export function gradeHonesty(trades: Trade[]): GradeHonesty {
  const regraded = trades.filter((t) => t.regrade != null);
  const scored = regraded.map((t) => {
    const from = t.grade_letter;
    const to = t.regrade as string;
    return { trade: t, from, to, drop: (GRADE_RANK[from] ?? 0) - (GRADE_RANK[to] ?? 0) };
  });

  return {
    regraded: regraded.length,
    inflated: scored.filter((s) => s.drop > 0).length,
    understated: scored.filter((s) => s.drop < 0).length,
    matched: scored.filter((s) => s.drop === 0).length,
    averageDrop: scored.length ? scored.reduce((sum, s) => sum + s.drop, 0) / scored.length : null,
    worst: scored.filter((s) => s.drop > 0).sort((a, b) => b.drop - a.drop).slice(0, 5),
  };
}

/**
 * What hesitation cost.
 *
 * A skipped setup that would have won is a real loss that never appears in the
 * P&L, which is exactly why it goes unexamined. `rLeft` only counts the ones
 * you went back and confirmed — a guess here would make the number worthless.
 */
export interface Hesitation {
  /** Setups marked 'Not taken'. */
  skipped: number;
  /** Of those, the ones you actually went back and checked. */
  checked: number;
  wouldHaveWon: number;
  wouldHaveLost: number;
  /** Total R the confirmed winners would have paid. */
  rLeft: number;
  /** R the confirmed losers saved you by being skipped. */
  rAvoided: number;
  /** Skips grouped by the real reason, costliest first. */
  byReason: Array<{ reason: SkipReason; count: number; rLeft: number }>;
}

export function hesitation(trades: Trade[]): Hesitation {
  const skipped = trades.filter((t) => t.outcome === 'Not taken');
  const checked = skipped.filter((t) => t.would_have_hit_tp != null);
  const won = checked.filter((t) => t.would_have_hit_tp === true);
  const lost = checked.filter((t) => t.would_have_hit_tp === false);

  const byReason = SKIP_REASONS.map((reason) => {
    const group = skipped.filter((t) => t.skip_reason === reason);
    return {
      reason,
      count: group.length,
      rLeft: group
        .filter((t) => t.would_have_hit_tp === true)
        .reduce((sum, t) => sum + (t.r_left_on_table ?? 0), 0),
    };
  })
    .filter((g) => g.count > 0)
    .sort((a, b) => b.rLeft - a.rLeft || b.count - a.count);

  return {
    skipped: skipped.length,
    checked: checked.length,
    wouldHaveWon: won.length,
    wouldHaveLost: lost.length,
    rLeft: won.reduce((sum, t) => sum + (t.r_left_on_table ?? 0), 0),
    rAvoided: lost.reduce((sum, t) => sum + Math.abs(t.r_left_on_table ?? 0), 0),
    byReason,
  };
}

/**
 * Is each checklist item earning its weight?
 *
 * For every item, the R per trade taken with it ticked against the R per trade
 * taken without. A large positive lift on a 5-point item, or none at all on a
 * 20-point one, is an argument that the weights are wrong — which is a thing
 * the plan should be allowed to learn.
 */
export interface ItemEdge {
  key: ChecklistKey;
  label: string;
  points: number;
  withCount: number;
  withoutCount: number;
  withAvgR: number | null;
  withoutAvgR: number | null;
  /** withAvgR − withoutAvgR. Null until both sides have a trade. */
  lift: number | null;
}

export function checklistEdge(trades: Trade[]): ItemEdge[] {
  const taken = trades.filter((t) => isTaken(t.outcome) && t.r_multiple != null);
  const avg = (ts: Trade[]) =>
    ts.length ? ts.reduce((sum, t) => sum + (t.r_multiple as number), 0) / ts.length : null;

  return CHECKLIST_ITEMS.map((item) => {
    // N/A is neither side. A trade where the condition never arose says
    // nothing about whether the condition is worth checking, and counting it
    // as "without" would make every box look better than it is.
    const on = taken.filter((t) => t[item.key] === true);
    const off = taken.filter((t) => t[item.key] === false);
    const withAvgR = avg(on);
    const withoutAvgR = avg(off);
    return {
      key: item.key,
      label: item.label,
      points: item.points,
      withCount: on.length,
      withoutCount: off.length,
      withAvgR,
      withoutAvgR,
      lift: withAvgR != null && withoutAvgR != null ? withAvgR - withoutAvgR : null,
    };
  });
}


/**
 * One account at a time.
 *
 * Replay fills are not real fills and a demo account has no fear in it, so
 * summing backtest R into live R would make every figure downstream a lie.
 * This is applied before anything else in this file runs.
 */
export function forAccount(trades: Trade[], account: Account | 'All'): Trade[] {
  // 'All' means every real account — never Missed, whose trades did not
  // happen, nor Backtest, whose fills were not real. Choosing either by name
  // is the only way in (domain.ts SEPARATE_ACCOUNTS).
  return account === 'All'
    ? trades.filter((t) => isReal(t.account))
    : trades.filter((t) => t.account === account);
}

/**
 * Accounts that actually have trades in them, busiest first.
 *
 * Ordered by count rather than by the enum, because the first one is what the
 * Stats page opens on — and opening on a demo account with eleven trades while
 * the live one has thirty-five is the wrong first thing to see.
 */
export function accountsInUse(trades: Trade[]): Array<{ account: Account; count: number }> {
  // ACCOUNT_VALUES, not ACCOUNTS: a retired label still has trades in it and
  // has to stay switchable, or the history under it becomes unreachable.
  return ACCOUNT_VALUES
    .map((account) => ({ account, count: trades.filter((t) => t.account === account).length }))
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Hindsight-graded and pre-graded trades cannot be pooled without lying to
 * myself: a grade given after I knew the result is not evidence that the
 * grading works.
 */
export function preGradedOnly(trades: Trade[]): Trade[] {
  return trades.filter((t) => !t.graded_post_hoc);
}

/* ------------------------------------------------------------------ *
 * Stats that are supposed to change what I do next.
 * ------------------------------------------------------------------ */

export interface CurvePoint { i: number; date: string; r: number; cumulative: number }

/**
 * Two equity curves from the same trades: the ones where the checklist says
 * the rules were followed, and the ones where it says they weren't.
 *
 * This is the single most useful picture in the app. One line is a P&L chart,
 * which tells you what happened. Two lines on the same axis is an argument:
 * if the rule-following curve rises and the rule-breaking one falls, the plan
 * is the edge and nothing else needs saying. If they are the same shape, the
 * plan is not doing the work I think it is.
 */
export interface EquityCurves {
  followed: CurvePoint[];
  broken: CurvePoint[];
  /** Every taken trade in order, for the combined line. */
  all: CurvePoint[];
}

function curve(trades: Trade[]): CurvePoint[] {
  let cumulative = 0;
  return trades
    .filter((t) => isTaken(t.outcome) && t.r_multiple != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t, i) => {
      cumulative += t.r_multiple as number;
      return { i, date: t.date, r: t.r_multiple as number, cumulative };
    });
}

/** `followed` decides the split; pages that know the day rules pass lib/review planBreaks through it. */
export function equityCurves(trades: Trade[], followed: (t: Trade) => boolean = derivedAdherence): EquityCurves {
  return {
    followed: curve(trades.filter((t) => followed(t))),
    broken: curve(trades.filter((t) => !followed(t))),
    all: curve(trades),
  };
}

/** R outcomes bucketed, so the shape of the distribution is visible. */
export interface HistogramBin { label: string; from: number; to: number; count: number }

export function rHistogram(trades: Trade[]): HistogramBin[] {
  const edges = [-Infinity, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, Infinity];
  const bins: HistogramBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i];
    const to = edges[i + 1];
    const label = from === -Infinity ? '< −2R' : to === Infinity ? '3R +'
      : `${from > 0 ? '+' : ''}${from} to ${to > 0 ? '+' : ''}${to}`;
    bins.push({ label, from, to, count: 0 });
  }
  for (const t of trades) {
    if (!isTaken(t.outcome) || t.r_multiple == null) continue;
    const r = t.r_multiple;
    const bin = bins.find((b) => r >= b.from && r < b.to);
    if (bin) bin.count += 1;
  }
  return bins.filter((b) => b.count > 0);
}

/**
 * The grade bands, with the sample size attached to every one.
 *
 * The `n` is not decoration. Four trades in a bucket can show any win rate at
 * all, and a chart that does not say so invites exactly the wrong conclusion.
 */
export interface BandRow {
  label: string;
  count: number;
  taken: number;
  winRate: number | null;
  totalR: number;
  expectancy: number | null;
  /** True when there are too few trades to read anything into it. */
  thin: boolean;
}

export function byGradeBand(trades: Trade[]): BandRow[] {
  return GRADE_BANDS.map((band) => {
    const ts = trades.filter((t) => t.checklist_score >= band.min && t.checklist_score <= band.max);
    const stats = aggregate(ts);
    const e = edge(ts);
    return {
      label: band.label,
      count: stats.count,
      taken: stats.taken,
      winRate: stats.winRate,
      totalR: stats.totalR,
      expectancy: e.expectancy,
      thin: stats.taken < MIN_SAMPLE,
    };
  }).filter((b) => b.count > 0);
}

/** Win rate by the confidence I claimed before I knew. */
export function byConfidence(trades: Trade[]): BandRow[] {
  return CONFIDENCE_LEVELS.map((level) => {
    const ts = trades.filter((t) => t.confidence_at_entry === level);
    const stats = aggregate(ts);
    const e = edge(ts);
    return {
      label: `${level}`,
      count: stats.count,
      taken: stats.taken,
      winRate: stats.winRate,
      totalR: stats.totalR,
      expectancy: e.expectancy,
      thin: stats.taken < MIN_SAMPLE,
    };
  }).filter((b) => b.count > 0);
}

/** Consecutive days with at least one entry. Journaling streak, not winning streak. */
export interface Streaks {
  journalingCurrent: number;
  journalingBest: number;
  adherenceCurrent: number;
  adherenceBest: number;
}

const dayOf = (iso: string) => iso.slice(0, 10);

export function streaks(all: Trade[]): Streaks {
  // Days: an undated backtest happened on no day we know.
  const trades = all.filter(isDated);
  // Grouped once: scanning every trade for every day was quadratic, and the
  // board pays for this on every mount.
  const byDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const day = dayOf(t.date);
    const list = byDay.get(day);
    if (list) list.push(t); else byDay.set(day, [t]);
  }
  const days = [...byDay.keys()].sort();

  const runOf = (list: string[]) => {
    let best = 0; let current = 0; let prev: string | null = null;
    for (const day of list) {
      const consecutive = prev !== null
        && (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`)) === 86_400_000;
      current = consecutive ? current + 1 : 1;
      best = Math.max(best, current);
      prev = day;
    }
    // Only counts as current if it reaches today or yesterday — a streak that
    // ended in March is not a streak.
    // Local dates, like the trades' own: a UTC "today" rolls over in the
    // evening in the Americas and ended a live streak early.
    const today = localDay();
    const yesterday = localDay(new Date(Date.now() - 86_400_000));
    const live = list.length > 0 && (list[list.length - 1] === today || list[list.length - 1] === yesterday);
    return { current: live ? current : 0, best };
  };

  // A clean day is one where every trade on it followed the rules.
  const cleanDays = days.filter((day) => byDay.get(day)!.every((t) => derivedAdherence(t)));

  const j = runOf(days);
  const a = runOf(cleanDays);
  return {
    journalingCurrent: j.current, journalingBest: j.best,
    adherenceCurrent: a.current, adherenceBest: a.best,
  };
}

/** R and count per weekday and entry hour, for the heatmap. */
export interface HeatCell { day: number; hour: number; count: number; totalR: number }

export function whenHeatmap(trades: Trade[]): HeatCell[] {
  const cells = new Map<string, HeatCell>();
  for (const t of trades) {
    // An undated backtest has no weekday or hour — only when it was logged.
    if (!isTaken(t.outcome) || !isDated(t)) continue;
    const d = new Date(t.date);
    const day = d.getDay();
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    const cell = cells.get(key) ?? { day, hour, count: 0, totalR: 0 };
    cell.count += 1;
    cell.totalR += t.r_multiple ?? 0;
    cells.set(key, cell);
  }
  return [...cells.values()];
}

/**
 * Whether the losers were ever winners.
 *
 * MAE and MFE used to live here too. They were removed: filling in two decimal
 * numbers per trade is real work, and nothing was ever read off them that this
 * one boolean does not already say more directly.
 */
export interface Excursion {
  /** Losers where the question was actually answered. */
  losersWithData: number;
  losersThatReached1R: number;
}

export function excursion(trades: Trade[]): Excursion {
  const losers = trades.filter((t) => isTaken(t.outcome) && t.outcome === 'Loss');
  const withData = losers.filter((t) => t.reached_1r != null);
  return {
    losersWithData: withData.length,
    losersThatReached1R: withData.filter((t) => t.reached_1r === true).length,
  };
}

/**
 * Which targets actually get hit — the hit rate, split by target type and by
 * the two modifiers that are supposed to matter (fresh, other side taken).
 * Counts only trades that answered "Target hit before the stop?"; an
 * unanswered trade is unknown, never a miss.
 */
export interface HitRow { key: string; label: string; answered: number; hit: number; rate: number | null }
export interface TargetHits {
  answered: number;
  /**
   * The six target classes, in their expected order — strongest draw first.
   * Trades on a retired type (or none) are one row at the end.
   */
  byClass: Array<HitRow & { rank: number | null }>;
  /**
   * Where my data disagrees with that order: a lower-ranked class out-hitting
   * a higher one, both with at least MIN_SAMPLE answers. Null when it agrees
   * or the samples are too small to say.
   */
  upset: { higher: string; lower: string } | null;
  byType: HitRow[];
  fresh: HitRow[];
  opposite: HitRow[];
  /** Max R reached, over trades that recorded it. */
  mfe: { n: number; avg: number | null; reached2R: number };
}

function hitRow(key: string, label: string, list: Trade[]): HitRow {
  const answered = list.filter((t) => t.target_hit != null);
  const hit = answered.filter((t) => t.target_hit === true).length;
  return { key, label, answered: answered.length, hit, rate: answered.length ? hit / answered.length : null };
}

export function targetHits(trades: Trade[]): TargetHits {
  const taken = trades.filter((t) => isTaken(t.outcome));
  const answered = taken.filter((t) => t.target_hit != null);
  const types = [...new Set(answered.map((t) => t.target_type ?? 'No target'))];
  const byType = types
    .map((ty) => hitRow(ty, ty, answered.filter((t) => (t.target_type ?? 'No target') === ty)))
    .sort((a, b) => b.answered - a.answered);
  const byClass: TargetHits['byClass'] = TARGET_CLASSES.map((c, i) => ({
    ...hitRow(c.key, c.label, answered.filter((t) => targetClassOf(t.target_type)?.key === c.key)),
    rank: i + 1,
  }));
  const unclassed = answered.filter((t) => !targetClassOf(t.target_type));
  if (unclassed.length) byClass.push({ ...hitRow('other', 'Retired type or none', unclassed), rank: null });
  let upset: TargetHits['upset'] = null;
  const sized = byClass.filter((r) => r.rank != null && r.answered >= MIN_SAMPLE && r.rate != null);
  for (let i = 0; i < sized.length && !upset; i++) {
    for (let j = i + 1; j < sized.length; j++) {
      if (sized[j].rate! > sized[i].rate!) { upset = { higher: sized[i].label, lower: sized[j].label }; break; }
    }
  }
  const tri = (field: 'target_fresh' | 'opposite_taken', yes: string, no: string) => [
    hitRow('yes', yes, answered.filter((t) => t[field] === true)),
    hitRow('no', no, answered.filter((t) => t[field] === false)),
  ];
  const withMfe = taken.filter((t) => t.mfe_r != null);
  return {
    answered: answered.length,
    byClass,
    upset,
    byType,
    fresh: tri('target_fresh', 'Untouched target', 'Already tapped'),
    opposite: tri('opposite_taken', 'Other side taken first', 'Other side still there'),
    mfe: {
      n: withMfe.length,
      avg: withMfe.length ? withMfe.reduce((s, t) => s + (t.mfe_r ?? 0), 0) / withMfe.length : null,
      reached2R: withMfe.filter((t) => (t.mfe_r ?? 0) >= 2).length,
    },
  };
}

/**
 * The two sides of passing on a setup.
 *
 * Hesitation cost is R left behind on setups that met the standard. Discipline
 * value is R saved by passing on ones that did not. If the first is bigger
 * than my actual losses, entries are not the problem.
 */
export interface PassedSetups {
  hesitationCostR: number;
  hesitationCount: number;
  disciplineValueR: number;
  disciplineCount: number;
}

export function passedSetups(trades: Trade[]): PassedSetups {
  const passed = trades.filter((t) => t.outcome === 'Not taken');
  const shouldHave = passed.filter((t) => t.checklist_score >= TAKE_IT_THRESHOLD && t.trigger_fired);
  const rightToPass = passed.filter((t) => t.checklist_score < TAKE_IT_THRESHOLD);
  const sum = (list: Trade[]) =>
    list.reduce((n, t) => n + (t.would_be_r ?? t.r_left_on_table ?? 0), 0);
  return {
    hesitationCostR: sum(shouldHave),
    hesitationCount: shouldHave.length,
    // A negative would-be R on a setup below standard is R I did not lose.
    disciplineValueR: -sum(rightToPass),
    disciplineCount: rightToPass.length,
  };
}

/** R lost per mistake tag, worst first. A tag on a winner still counts as a tag. */
export function rByMistakeTag(trades: Trade[]): Array<{ tag: MistakeTag; count: number; totalR: number }> {
  const out = new Map<MistakeTag, { count: number; totalR: number }>();
  for (const t of trades) {
    for (const tag of t.mistake_tags) {
      const entry = out.get(tag) ?? { count: 0, totalR: 0 };
      entry.count += 1;
      entry.totalR += t.r_multiple ?? 0;
      out.set(tag, entry);
    }
  }
  return [...out].map(([tag, v]) => ({ tag, ...v })).sort((a, b) => a.totalR - b.totalR);
}

/** What the market did, by the R it came with — worst first, like the mistakes. */
export function rByMarketTag(trades: Trade[]): Array<{ tag: string; count: number; totalR: number }> {
  const out = new Map<string, { count: number; totalR: number }>();
  for (const t of trades) {
    if (!isTaken(t.outcome)) continue;
    for (const tag of t.market_tags ?? []) {
      const entry = out.get(tag) ?? { count: 0, totalR: 0 };
      entry.count += 1;
      entry.totalR += t.r_multiple ?? 0;
      out.set(tag, entry);
    }
  }
  return [...out].map(([tag, v]) => ({ tag, ...v })).sort((a, b) => a.totalR - b.totalR);
}

/** What worked, by the R it came with — best first. The mirror of rByMistakeTag. */
export function rByWorkedTag(trades: Trade[]): Array<{ tag: string; count: number; totalR: number }> {
  const out = new Map<string, { count: number; totalR: number }>();
  for (const t of trades) {
    if (!isTaken(t.outcome)) continue;
    for (const tag of t.worked_tags ?? []) {
      const entry = out.get(tag) ?? { count: 0, totalR: 0 };
      entry.count += 1;
      entry.totalR += t.r_multiple ?? 0;
      out.set(tag, entry);
    }
  }
  return [...out].map(([tag, v]) => ({ tag, ...v })).sort((a, b) => b.totalR - a.totalR);
}


/**
 * Does the model hold? The gates and the rubric, checked against results.
 *
 * Rubric 2 says a sweep of nothing nameable, or more than one gap, is not the
 * model — and that a trendline (LRLR) is the weakest target there is. Those are claims
 * about what makes money, so they get tested like one: count, win rate and net
 * R for each side of each rule. If the NONE sweeps and the stacked gaps earn
 * as much as the rest, the gates are wrong and should go.
 */
export interface BreakdownRow {
  key: string;
  label: string;
  /** Retired value, or not recorded: shown, but set apart from the rest. */
  muted?: boolean;
  stats: Aggregate;
}

export interface ModelBreakdowns {
  sweepTier: BreakdownRow[];
  /** Rubric 4 (trial): the liquidity event each trade had, as rubric 4 reads it. */
  liquidityTrial: BreakdownRow[];
  targetType: BreakdownRow[];
  singularGap: BreakdownRow[];
  account: BreakdownRow[];
  entryGrade: BreakdownRow[];
}

function breakdown(
  trades: Trade[],
  keyOf: (t: Trade) => string,
  order: Array<{ key: string; label: string; muted?: boolean; always?: boolean }>,
): BreakdownRow[] {
  return order
    .map(({ key, label, muted, always }) => {
      const group = trades.filter((t) => keyOf(t) === key);
      return { key, label, muted, always, stats: aggregate(group) };
    })
    .filter((row) => row.always || row.stats.count > 0)
    .map(({ always: _a, ...row }) => row);
}

/**
 * The trial's verdict on its one new path: delivery-only setups, taken.
 * Promotion needs TRIAL_SAMPLE of them and a positive average R.
 *
 * `missed` are the delivery-only setups skipped under rubric 3 and logged in
 * the Missed account with the R they would have had. They count towards the
 * verdict — a rule is tested by what its setups do, not by whether money was
 * on them — but never towards any real total, and the split is reported so
 * the verdict says how much of it is hypothetical.
 */
export function deliveryOnlyVerdict(trades: Trade[], missed: Trade[] = []): {
  n: number; real: number; missed: number; avgR: number | null; ready: boolean; positive: boolean | null;
} {
  const pick = (ts: Trade[]) => ts.filter((t) => trialEventOf(t) === 'delivery');
  const real = aggregate(pick(trades));
  const hyp = aggregate(pick(missed));
  const n = real.taken + hyp.taken;
  const avgR = n ? (real.totalR + hyp.totalR) / n : null;
  return {
    n, real: real.taken, missed: hyp.taken, avgR, ready: n >= TRIAL_SAMPLE,
    positive: avgR == null ? null : avgR > 0,
  };
}

/**
 * `trades` is the stats page's selection (one account, filters applied);
 * `everyAccount` is the same selection before the account was chosen, for
 * the one table that compares accounts.
 */
export function modelBreakdowns(trades: Trade[], everyAccount: Trade[]): ModelBreakdowns {
  return {
    sweepTier: breakdown(trades, (t) => t.sweep_tier ?? 'unrecorded', [
      ...SWEEP_TIERS.map((tier) => ({ key: tier, label: SWEEP_TIER_SPEC[tier].label, always: true })),
      { key: 'unrecorded', label: 'Not recorded', muted: true },
    ]),
    liquidityTrial: breakdown(trades, trialEventOf, [
      { key: 'both', label: 'Sweep + delivery', always: true },
      { key: 'sweep', label: 'Sweep only', always: true },
      { key: 'delivery', label: 'Delivery only', always: true },
      { key: 'none', label: 'None named', always: true },
      { key: 'unrecorded', label: 'Before the trial', muted: true },
    ]),
    targetType: breakdown(trades, (t) => t.target_type, [
      ...TARGET_TYPES.map((key) => ({ key, label: key, always: true })),
      ...RETIRED_TARGET_TYPES.map((key) => ({ key, label: `${key} (retired)`, muted: true })),
    ]),
    singularGap: breakdown(trades, (t) => (t.singular_gap == null ? 'unrecorded' : t.singular_gap ? 'yes' : 'no'), [
      { key: 'yes', label: 'One clean gap', always: true },
      { key: 'no', label: 'Stacked / messy', always: true },
      { key: 'unrecorded', label: 'Not recorded', muted: true },
    ]),
    account: breakdown(everyAccount, (t) => t.account, ACCOUNT_VALUES.map((a) => ({
      key: a, label: isHypothetical(a) ? `${a} (hypothetical)` : isSeparate(a) ? `${accountLabel(a)} (replay)` : a, muted: isSeparate(a),
    }))),
    entryGrade: breakdown(trades, (t) => t.grade_letter,
      GRADE_LETTERS.map((l) => ({ key: l, label: l, always: true }))),
  };
}
