/**
 * The review engine: which of my rules a trade or a day broke, how that is
 * trending, and what to read before the next session and after this one.
 *
 * Pure functions over trades — no database, no network, no model. The rules
 * are in lib/ruleBook.ts, the phrase patterns in lib/phrases.ts (through
 * lib/insights.ts). Everything is descriptive: nothing here can refuse a
 * trade.
 */
import { DAY_RULES, DEFAULT_RULE_CONFIG, TRADE_RULES, checkable, dayCheckable, type DayContext, type RuleConfig, type Verdict } from './ruleBook';
import { EARLY_N, LEAK_MIN_TRADES, THEMES, analyse, themesOf, type ThemeResult } from './insights';
import { isHypothetical, isTaken } from './domain';
import type { Trade } from './types';

export interface BrokenRule { id: string; scope: 'trade' | 'day'; text: string; short: string }

const asBroken = (r: { id: string; scope: 'trade' | 'day'; text: string; short: string }): BrokenRule =>
  ({ id: r.id, scope: r.scope, text: r.text, short: r.short });

/* ---------------------------------------------------------------- trade */

/** For each rule with an `answered` field: when it was first answered in this set of trades. */
export function fieldEras(trades: readonly Trade[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of TRADE_RULES) {
    if (!r.answered) continue;
    const first = trades.filter((t) => r.answered!(t)).map((t) => t.created_at).sort()[0];
    if (first) out.set(r.id, first);
  }
  return out;
}

/** A rule's verdict, null for a trade logged before its field existed. */
function verdictOf(r: (typeof TRADE_RULES)[number], t: Trade, cfg: RuleConfig, eras?: Map<string, string>): Verdict {
  if (r.answered && eras) {
    const since = eras.get(r.id);
    if (!since || t.created_at < since) return null;
  }
  return r.test(t, cfg);
}

/** Every trade rule's verdict on one trade: true kept, false broken, null cannot tell. */
export function evaluateTrade(t: Trade, cfg: RuleConfig = DEFAULT_RULE_CONFIG): Record<string, Verdict> {
  return Object.fromEntries(TRADE_RULES.map((r) => [r.id, checkable(t) ? r.test(t, cfg) : null]));
}

/** The trade rules this trade broke, with their text. */
export function checkTrade(t: Trade, cfg: RuleConfig = DEFAULT_RULE_CONFIG, eras?: Map<string, string>): BrokenRule[] {
  if (!checkable(t)) return [];
  return TRADE_RULES.filter((r) => verdictOf(r, t, cfg, eras) === false).map(asBroken);
}

/* ------------------------------------------------------------------ day */

/** A trade's day for day rules (local 'YYYY-MM-DD'), or null when no day rule applies to it. */
export const ruleDay = (t: Trade): string | null => (dayCheckable(t) ? t.date.slice(0, 10) : null);

/** The day rules one day's trades broke, and by which trades. Backtests and undated trades are skipped. */
export function checkDay(trades: readonly Trade[], cfg: RuleConfig = DEFAULT_RULE_CONFIG, ctx: DayContext = {}):
  Array<BrokenRule & { tradeIds: string[] }> {
  const day = trades.filter(dayCheckable).sort((a, b) => a.date.localeCompare(b.date));
  if (!day.length) return [];
  return DAY_RULES.map((r) => ({ ...asBroken(r), tradeIds: r.broken(day, cfg, ctx) })).filter((r) => r.tradeIds.length > 0);
}

/** Day-rule breaks across many days, per trade id. `ctxFor` gives each day's context (its prep). */
export function dayBreaksByTrade(trades: readonly Trade[], ctxFor: (day: string) => DayContext = () => ({}),
  cfg: RuleConfig = DEFAULT_RULE_CONFIG): Map<string, BrokenRule[]> {
  const days = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = ruleDay(t);
    if (d) days.set(d, [...(days.get(d) ?? []), t]);
  }
  const out = new Map<string, BrokenRule[]>();
  for (const [d, ts] of days) {
    for (const b of checkDay(ts, cfg, ctxFor(d))) {
      for (const id of b.tradeIds) out.set(id, [...(out.get(id) ?? []), { id: b.id, scope: b.scope, text: b.text, short: b.short }]);
    }
  }
  return out;
}

/** Every rule a trade broke: its own, and the day's it took part in. */
export function brokenFor(t: Trade, dayBreaks: Map<string, BrokenRule[]>, cfg: RuleConfig = DEFAULT_RULE_CONFIG,
  eras?: Map<string, string>): BrokenRule[] {
  return [...checkTrade(t, cfg, eras), ...(dayBreaks.get(t.id) ?? [])];
}

/* --------------------------------------------------------------- trends */

/** Taken, real or replayed, with an outcome — in the order they happened. */
const reviewed = (trades: readonly Trade[]) => trades
  .filter((t) => checkable(t) && isTaken(t.outcome) && t.status !== 'Planned')
  .sort((a, b) => a.date.localeCompare(b.date));

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const round = (v: number | null, dp = 2) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

export interface Compliance { kept: number; of: number; pct: number | null }
export interface RuleTrend {
  id: string; scope: 'trade' | 'day'; text: string; short: string;
  last10: Compliance; prev10: Compliance;
  /** Kept-rate change, in points (last 10 minus previous 10); null when either side has none. */
  change: number | null;
  /** Fewer than EARLY_N answered trades in the last 10. */
  early: boolean;
}
export interface LessonRepeat { theme: string; title: string; lessonTradeId: string; lessonDate: string; repeatTradeId: string; repeatDate: string; after: number }
export interface GradeRow { letter: string; n: number; avgR: number | null; early: boolean }

export interface Trends {
  n: number;
  /** n < EARLY_N: everything below is an early signal. */
  early: boolean;
  /** Rolling average R over the last 10 trades, at each trade. */
  rolling: Array<{ id: string; date: string; avgR: number }>;
  rules: RuleTrend[];
  repeats: LessonRepeat[];
  grades: GradeRow[];
}

function compliance(ts: Trade[], verdict: (t: Trade) => Verdict): Compliance {
  const answered = ts.map(verdict).filter((v): v is boolean => v != null);
  const kept = answered.filter(Boolean).length;
  return { kept, of: answered.length, pct: answered.length ? round(kept / answered.length, 3) : null };
}

export function trends(trades: readonly Trade[], ctxFor: (day: string) => DayContext = () => ({}),
  cfg: RuleConfig = DEFAULT_RULE_CONFIG): Trends {
  const ts = reviewed(trades);
  const rolling = ts.map((t, i) => {
    const win = ts.slice(Math.max(0, i - 9), i + 1).map((x) => x.r_multiple ?? 0);
    return { id: t.id, date: t.date.slice(0, 10), avgR: round(mean(win)) ?? 0 };
  });

  const last = ts.slice(-10);
  const prev = ts.slice(-20, -10);
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  const eras = fieldEras(trades);
  const dayVerdict = (id: string) => (t: Trade): Verdict => (ruleDay(t) ? !(breaks.get(t.id) ?? []).some((b) => b.id === id) : null);
  const rules: RuleTrend[] = [
    ...TRADE_RULES.map((r) => ({ r, v: (t: Trade) => verdictOf(r, t, cfg, eras) })),
    ...DAY_RULES.map((r) => ({ r, v: dayVerdict(r.id) })),
  ].map(({ r, v }) => {
    const a = compliance(last, v);
    const b = compliance(prev, v);
    return {
      ...asBroken(r), last10: a, prev10: b,
      change: a.pct != null && b.pct != null ? Math.round((a.pct - b.pct) * 100) : null,
      early: a.of < EARLY_N,
    };
  });

  // A lesson written, then the same pattern again within the next 5 trades.
  const repeats: LessonRepeat[] = [];
  ts.forEach((t, i) => {
    for (const theme of themesOf(t, 'lesson')) {
      const next = ts.slice(i + 1, i + 6).findIndex((x) => themesOf(x).includes(theme));
      if (next === -1) continue;
      const x = ts[i + 1 + next];
      repeats.push({
        theme, title: THEMES.find((d) => d.id === theme)?.title ?? theme,
        lessonTradeId: t.id, lessonDate: t.date.slice(0, 10), repeatTradeId: x.id, repeatDate: x.date.slice(0, 10), after: next + 1,
      });
    }
  });

  // Grade honesty: does a better letter actually pay more?
  const letters = ['A+', 'A', 'B', 'C', 'F'];
  const grades = letters.map((letter) => {
    const g = ts.filter((t) => t.grade_letter === letter);
    return { letter, n: g.length, avgR: round(mean(g.filter((t) => t.r_multiple != null).map((t) => t.r_multiple as number))), early: g.length < EARLY_N };
  }).filter((g) => g.n > 0);

  return { n: ts.length, early: ts.length < EARLY_N, rolling, rules, repeats, grades };
}

/* ------------------------------------------------------- rule impact */

export interface RuleImpact { id: string; text: string; short: string; broken: number; kept: number; avgBroken: number | null; avgKept: number | null; impact: number; lastBroken: string | null }

/**
 * What breaking each rule cost: the R of the trades that broke it, against
 * what the same number of trades earned on average when it was kept. The #1
 * rule is the costliest — only named with LEAK_MIN_TRADES trades in view,
 * and only when it was broken at least EARLY_N times.
 */
export function ruleImpacts(trades: readonly Trade[], ctxFor: (day: string) => DayContext = () => ({}),
  cfg: RuleConfig = DEFAULT_RULE_CONFIG): { rows: RuleImpact[]; top: RuleImpact | null } {
  const ts = reviewed(trades).filter((t) => t.r_multiple != null);
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  const eras = fieldEras(trades);
  const all = [
    ...TRADE_RULES.map((r) => ({ r, v: (t: Trade) => verdictOf(r, t, cfg, eras) })),
    ...DAY_RULES.map((r) => ({ r, v: (t: Trade): Verdict => (ruleDay(t) ? !(breaks.get(t.id) ?? []).some((b) => b.id === r.id) : null) })),
  ];
  const rows = all.map(({ r, v }) => {
    const broke = ts.filter((t) => v(t) === false);
    const kept = ts.filter((t) => v(t) === true);
    const avgB = mean(broke.map((t) => t.r_multiple as number));
    const avgK = mean(kept.map((t) => t.r_multiple as number));
    return {
      id: r.id, text: r.text, short: r.short, broken: broke.length, kept: kept.length,
      avgBroken: round(avgB), avgKept: round(avgK),
      impact: round(avgB != null && avgK != null ? (avgK - avgB) * broke.length : 0) ?? 0,
      lastBroken: broke.length ? broke[broke.length - 1].date.slice(0, 10) : null,
    };
  }).sort((a, b) => b.impact - a.impact);
  const top = ts.length >= LEAK_MIN_TRADES ? rows.find((r) => r.impact > 0 && r.broken >= EARLY_N) ?? null : null;
  return { rows, top };
}

/* --------------------------------------------------------- the cards */

/** The day a trade was logged on (local), which is when its session happened — backtests included. */
export const loggedDay = (t: Trade, tz?: string): string => new Date(t.created_at.endsWith('Z') ? t.created_at : `${t.created_at}Z`)
  .toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined);

export interface BeforeYouTrade {
  leak: { title: string; rule: string; n: number; netR: number } | null;
  /** Why there is no #1 leak yet, when there is not. */
  leakWaiting: string | null;
  lastSession: { day: string; trades: number; broken: Array<{ short: string; count: number }> } | null;
  /** The rule behind the #1 leak (linked), or — when the leak has none — the costliest rule. */
  topRule: { text: string; short: string; daysSince: number | null; lastBroken: string | null; linked: boolean } | null;
}

/**
 * The written rule behind each pattern, where there is one: keeping it is
 * what fixing the pattern looks like. Patterns with no rule of their own
 * (fear, slow price, …) have none here.
 */
export const LEAK_RULES: Record<string, string> = {
  early: 'inversion',
  sweep: 'sweep',
  target: 'named-target',
  pd: 'pd',
  overtrading: 'stop-after-losses',
  breakeven: 'management',
  prep: 'max-r',
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** The "Before you trade" card: the #1 leak and its rule, last session's breaks, and how long since the #1 rule went. */
export function beforeYouTrade(trades: readonly Trade[], today: string, ctxFor: (day: string) => DayContext = () => ({}),
  cfg: RuleConfig = DEFAULT_RULE_CONFIG, tz?: string): BeforeYouTrade {
  const ins = analyse(trades);
  const ts = reviewed(trades);
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  const eras = fieldEras(trades);
  const sessions = [...new Set(ts.map((t) => loggedDay(t, tz)))].filter((d) => d < today).sort();
  const lastDay = sessions[sessions.length - 1] ?? null;
  let lastSession: BeforeYouTrade['lastSession'] = null;
  if (lastDay) {
    const s = ts.filter((t) => loggedDay(t, tz) === lastDay);
    const counts = new Map<string, number>();
    for (const t of s) for (const b of brokenFor(t, breaks, cfg, eras)) counts.set(b.short, (counts.get(b.short) ?? 0) + 1);
    lastSession = { day: lastDay, trades: s.length, broken: [...counts].sort((a, b) => b[1] - a[1]).map(([short, count]) => ({ short, count })) };
  }
  const { rows, top } = ruleImpacts(trades, ctxFor, cfg);
  // The rule behind the #1 leak; with no leak, or one with no rule, the costliest rule.
  const linkedId = ins.focus ? LEAK_RULES[ins.focus.id] : undefined;
  const linked = linkedId ? rows.find((r) => r.id === linkedId) ?? null : null;
  const pick = linked ?? top;
  return {
    leak: ins.focus ? { title: ins.focus.title, rule: ins.focus.rule, n: ins.focus.n, netR: ins.focus.netR } : null,
    leakWaiting: ins.focus ? null : ins.read < LEAK_MIN_TRADES
      ? `Early signal: ${ins.read} of ${LEAK_MIN_TRADES} trades before a #1 leak is named.`
      : 'No pattern is costing you R repeatedly right now.',
    lastSession,
    topRule: pick ? { text: pick.text, short: pick.short, lastBroken: pick.lastBroken, linked: pick === linked,
      daysSince: pick.lastBroken ? daysBetween(pick.lastBroken, today) : null } : null,
  };
}

export interface CloseLine { kind: 'broken' | 'paid' | 'watch'; text: string; detail: string; score: number }

/**
 * The "Session close" card: at most three lines — one rule broken, one habit
 * that paid, one to watch — each the strongest of its kind by |R impact| ×
 * recency (later trades in the session weigh more), then ordered by score.
 */
export function sessionClose(session: readonly Trade[], history: readonly Trade[], ctxFor: (day: string) => DayContext = () => ({}),
  cfg: RuleConfig = DEFAULT_RULE_CONFIG): CloseLine[] {
  const ts = reviewed(session);
  if (!ts.length) return [];
  const breaks = dayBreaksByTrade(history, ctxFor, cfg);
  const eras = fieldEras(history.length ? history : session);
  // Recency: the session's last trade weighs 1, each earlier one 15% less.
  const w = (i: number) => 0.85 ** (ts.length - 1 - i);
  const mag = (t: Trade) => Math.max(0.25, Math.abs(t.r_multiple ?? 0));
  const lines: CloseLine[] = [];

  const brokenScore = new Map<string, { short: string; text: string; score: number; r: number; n: number }>();
  ts.forEach((t, i) => {
    for (const b of brokenFor(t, breaks, cfg, eras)) {
      const cur = brokenScore.get(b.id) ?? { short: b.short, text: b.text, score: 0, r: 0, n: 0 };
      brokenScore.set(b.id, { ...cur, score: cur.score + mag(t) * w(i), r: cur.r + (t.r_multiple ?? 0), n: cur.n + 1 });
    }
  });
  const worst = [...brokenScore.values()].sort((a, b) => b.score - a.score)[0];
  if (worst) lines.push({ kind: 'broken', text: worst.text, detail: `Broken on ${worst.n} trade${worst.n === 1 ? '' : 's'} today (${signed(worst.r)}).`, score: worst.score });

  const paid = new Map<string, { label: string; score: number; r: number }>();
  ts.forEach((t, i) => {
    if ((t.r_multiple ?? 0) <= 0) return;
    const habits = [
      ...(t.worked_tags ?? []),
      ...TRADE_RULES.filter((r) => r.test(t, cfg) === true).map((r) => r.short),
    ];
    for (const h of habits) {
      const cur = paid.get(h) ?? { label: h, score: 0, r: 0 };
      paid.set(h, { ...cur, score: cur.score + (t.r_multiple as number) * w(i), r: cur.r + (t.r_multiple as number) });
    }
  });
  const best = [...paid.values()].sort((a, b) => b.score - a.score)[0];
  if (best) lines.push({ kind: 'paid', text: best.label, detail: `On today's winners (${signed(best.r)}). Keep doing it.`, score: best.score });

  // To watch: a pattern in today's writing, weighted by what it has cost over time.
  const history_ = analyse(history).themes;
  const watch = new Map<string, { t: ThemeResult; score: number }>();
  ts.forEach((t, i) => {
    for (const id of themesOf(t)) {
      const th = history_.find((x) => x.id === id);
      if (!th || th.netR >= 0) continue;
      const cur = watch.get(id) ?? { t: th, score: 0 };
      watch.set(id, { ...cur, score: cur.score + Math.abs(th.netR) / Math.max(1, th.n) * mag(t) * w(i) });
    }
  });
  const look = [...watch.values()].sort((a, b) => b.score - a.score)[0];
  if (look) lines.push({ kind: 'watch', text: look.t.title, detail: look.t.rule, score: look.score });

  return lines.sort((a, b) => b.score - a.score).slice(0, 3);
}

const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(1)}R`;

/** A session's trades are all settled: nothing in it is still Planned or Live. */
export const allSettled = (session: readonly Trade[]) => session.length > 0 && session.every((t) => t.status === 'Settled');

/** Trades for the home cards: taken or missed but not Hindsight (the caller filters), backtests included. */
export const sessionTrades = (trades: readonly Trade[], day: string, tz?: string) =>
  trades.filter((t) => !t.deleted_at && !isHypothetical(t.account) && loggedDay(t, tz) === day);


