/**
 * The Flaw Deck: what is wrong with my trading, in order, and what to do
 * about it. Pure, over the Edge Engine's own outputs — the mistake ledger
 * (themes, rule breaks, repeated lessons), execution, the trade states, the
 * setup-quality spread and the missed-trade read. No new statistics: every
 * cost is the engine's shrunk comparison (lib/edge/compare) with its 80%
 * interval and evidence chip.
 *
 *   priority = P(the cost is real) × |shrunk cost per occurrence| × recent frequency
 *
 * Two kinds of flaw may join the deck while the R evidence is still Too early,
 * because they are evidence of a process flaw on their own: a lesson written
 * three or more times in 30 trades, and a filter that does not filter. They
 * say so on their chip. Never more than five flaws, never a strength, and
 * never a drill that loosens a written rule (lib/edge/flawText).
 */
import { compare, type Comparison } from './compare';
import { VERDICT_LABEL, type VerdictLevel } from './verdict';
import type { LedgerV2 } from './ledger';
import type { Execution } from './execution';
import type { Spread } from './quality';
import type { MissedStats } from './missed';
import type { TradeState } from './state';
import { sourceOf } from './fields';
import { FLAW_TEXT, ruleText, themeText, type FlawType } from './flawText';
import { THEMES } from '../insights';
import type { Trade } from '../types';

export const MAX_FLAWS = 5;
export const RECENT = 20;
export const TIMELINE = 30;
export const SNOOZE_TRADES = 20;
export const GRADUATE_AFTER = 20;
export const GRADUATE_KEPT = 0.9;
export const RELAPSE_HITS = 2;

export type Source = 'real' | 'backtest';
export interface Where { live: number; demo: number; eval: number; backtest: number; line: string | null }

export interface Flaw {
  key: string;
  type: FlawType;
  title: string;
  /** Every trade it happened on, oldest first (ids). */
  hits: string[];
  n: number;
  /** Times in the last 20 trades. */
  recent: number;
  cmp: Comparison | null;
  /** Shrunk R per occurrence (negative = costs). */
  costPer: number | null;
  level: VerdictLevel;
  /** The chip, honest about what the evidence is. */
  chip: string;
  /** In the deck on the strength of a pattern, not of R. */
  processOnly: boolean;
  priority: number;
  where: Where;
  quote: { date: string; text: string } | null;
  /** Repeated-lesson quotes, newest last. */
  quotes: Array<{ id: string; date: string; text: string }>;
  why: string;
  drill: string;
  tightens: string | null;
  /** The clearest examples: worst R first, with a chart. */
  examples: string[];
  /** The last 30 trades, oldest first: did this flaw happen on each? */
  timeline: Array<{ id: string; hit: boolean; r: number | null }>;
  /** What the card's chart draws. */
  chart: FlawChart;
}

export type FlawChart =
  | { kind: 'with-without'; cmp: Comparison }
  | { kind: 'quotes'; quotes: Array<{ date: string; text: string }> }
  | { kind: 'given-up'; trades: Array<{ id: string; realized: number; target: number }> }
  | { kind: 'mfe'; buckets: Array<{ label: string; n: number }> }
  | { kind: 'by-trade-no'; rows: Array<{ label: string; n: number; mean: number | null; lo: number | null; hi: number | null }> }
  | { kind: 'spread'; items: Array<{ label: string; share: number }>; grades: Array<{ grade: string; share: number }> }
  | { kind: 'scores'; skip: number | null; take: number | null; lo: number | null; hi: number | null };

export interface FlawInputs {
  /** Settled, taken trades with an R, oldest first — every account in view. */
  settled: readonly Trade[];
  ledger: LedgerV2;
  exec: Execution;
  states: Map<string, TradeState>;
  spread: Spread;
  missed: MissedStats | null;
  /** Theme ids written on each trade (lib/edge/text themesWith). */
  themesOf: (t: Trade) => string[];
  breaksOf: (t: Trade) => Array<{ id: string; short: string; source?: 'auto' | 'self' }>;
}

const P_LEVEL: Record<VerdictLevel, number> = { 'too-early': 0.5, hint: 0.75, likely: 0.9, confirmed: 0.975 };
const r = (t: Trade) => t.r_multiple as number;
const dayOf = (t: Trade) => t.date.slice(0, 10);

/** Where a flaw happens: live · demo · eval · backtest, and what that split means. */
export function whereItHappens(hits: readonly Trade[], all: readonly Trade[]): Where {
  const count = (list: readonly Trade[], s: string) => list.filter((t) => sourceOf(t.account) === s).length;
  const w = { live: count(hits, 'live'), demo: count(hits, 'demo'), eval: count(hits, 'eval'), backtest: count(hits, 'backtest') };
  const real = w.live + w.demo + w.eval;
  const btTotal = count(all, 'backtest');
  const line = real > 0 && w.backtest === 0 && btTotal >= 10 ? 'Only live — this is pressure, not skill.'
    : w.backtest >= 2 && real >= 1 ? 'In backtests too — this is a skill gap.'
    : w.backtest >= 2 && real === 0 ? 'Only in backtests so far — a skill gap, not pressure.'
    : null;
  return { ...w, line };
}

/** The chip on the card: the evidence level, or the honest note for a pattern-only flaw. */
function chipFor(level: VerdictLevel, processOnly: boolean, kind: 'writing' | 'filter' | 'other'): string {
  if (processOnly && level === 'too-early') {
    return kind === 'writing' ? 'Pattern in your writing · R impact too early'
      : kind === 'filter' ? 'Your filter does not filter · R impact too early' : `${VERDICT_LABEL[level]}`;
  }
  return VERDICT_LABEL[level];
}

export function findFlaws(i: FlawInputs): Flaw[] {
  const trades = i.settled;
  const byId = new Map(trades.map((t) => [t.id, t]));
  const last20 = new Set(trades.slice(-RECENT).map((t) => t.id));
  const last30 = trades.slice(-TIMELINE);
  const rs = trades.map(r);

  const build = (o: {
    key: string; type: FlawType; title: string; hitIds: string[]; cmp: Comparison | null; costPer?: number | null;
    level?: VerdictLevel; processOnly?: boolean; chipKind?: 'writing' | 'filter' | 'other';
    text: { why: string; drill: string; tightens: string | null };
    quotes?: Array<{ id: string; date: string; text: string }>; chart: FlawChart;
  }): Flaw => {
    const hitSet = new Set(o.hitIds);
    const hitTrades = trades.filter((t) => hitSet.has(t.id));
    const level = o.level ?? o.cmp?.verdict.level ?? 'too-early';
    const costPer = o.costPer !== undefined ? o.costPer : o.cmp ? o.cmp.diff : null;
    const recent = hitTrades.filter((t) => last20.has(t.id)).length;
    const processOnly = Boolean(o.processOnly);
    const share = Math.max(recent, processOnly ? 1 : 0) / RECENT;
    const priority = P_LEVEL[level] * Math.abs(costPer ?? (processOnly ? 0.25 : 0)) * share;
    const quotes = o.quotes ?? [];
    const lessonQuote = quotes.length ? quotes[quotes.length - 1] : null;
    return {
      key: o.key, type: o.type, title: o.title, hits: hitTrades.map((t) => t.id), n: hitTrades.length, recent, cmp: o.cmp, costPer,
      level, chip: chipFor(level, processOnly, o.chipKind ?? 'other'), processOnly, priority,
      where: whereItHappens(hitTrades, trades),
      quote: lessonQuote ? { date: lessonQuote.date, text: lessonQuote.text } : null, quotes,
      why: o.text.why, drill: o.text.drill, tightens: o.text.tightens,
      examples: [...hitTrades].filter((t) => t.screenshot_path).sort((a, b) => r(a) - r(b)).slice(0, 3).map((t) => t.id),
      timeline: last30.map((t) => ({ id: t.id, hit: hitSet.has(t.id), r: t.r_multiple })),
      chart: o.chart,
    };
  };

  const out: Flaw[] = [];
  const costs = (c: Comparison | null) => c != null && c.diff < 0;

  // Mistake themes (shrunk cost from the ledger), with the repeated-lesson quotes when the same theme repeats.
  const repeated = new Map(i.ledger.repeated.map((x) => [x.id, x]));
  for (const th of i.ledger.themes) {
    const rep = repeated.get(th.id);
    if (!costs(th.cmp) && !rep) continue;
    const def = THEMES.find((d) => d.id === th.id);
    out.push(build({
      key: `theme:${th.id}`, type: 'theme', title: th.title, hitIds: [...th.tradeIds].reverse(), cmp: th.cmp,
      processOnly: Boolean(rep), chipKind: 'writing',
      text: themeText(th.id, th.rule, def?.why ?? ''),
      quotes: rep?.quotes ?? quotesOf(trades, th.tradeIds, i),
      chart: th.cmp ? { kind: 'with-without', cmp: th.cmp } : { kind: 'quotes', quotes: (rep?.quotes ?? []).map((q) => ({ date: q.date, text: q.text })) },
    }));
    repeated.delete(th.id);
  }
  // A lesson repeated with no R behind it yet (the theme never showed on a settled trade's cost).
  for (const rep of repeated.values()) {
    const def = THEMES.find((d) => d.id === rep.id);
    out.push(build({
      key: `theme:${rep.id}`, type: 'repeat', title: rep.title, hitIds: rep.quotes.map((q) => q.id), cmp: null, costPer: null,
      processOnly: true, chipKind: 'writing', text: themeText(rep.id, rep.rule, def?.why ?? ''), quotes: rep.quotes,
      chart: { kind: 'quotes', quotes: rep.quotes.map((q) => ({ date: q.date, text: q.text })) },
    }));
  }

  // Rule breaks, auto and self.
  for (const rule of i.ledger.rules) {
    if (!costs(rule.cmp)) continue;
    const ids = trades.filter((t) => i.breaksOf(t).some((b) => b.id === rule.id)).map((t) => t.id);
    out.push(build({
      key: `rule:${rule.id}`, type: 'rule', title: `Breaking: ${rule.short}`, hitIds: ids, cmp: rule.cmp,
      text: FLAW_TEXT[`rule:${rule.id}`] ?? ruleText(rule.short), chart: { kind: 'with-without', cmp: rule.cmp! },
    }));
  }

  // Breakeven too early: moved to BE, stopped, and the target was hit later.
  if (i.exec.earlyBe.ids.length >= 2) {
    const ids = i.exec.earlyBe.ids;
    const per = -i.exec.earlyBe.costR / ids.length;
    const level: VerdictLevel = ids.length >= 8 ? 'likely' : ids.length >= 4 ? 'hint' : 'too-early';
    out.push(build({
      key: 'exec:early-be', type: 'early-be', title: 'Breakeven too early', hitIds: ids, cmp: null, costPer: per, level,
      text: FLAW_TEXT['exec:early-be'],
      chart: { kind: 'given-up', trades: ids.map((id) => byId.get(id)).filter((t): t is Trade => !!t).map((t) => ({ id: t.id, realized: r(t), target: plannedOf(t) ?? 2 })) },
    }));
  }

  // Losers that were never in profit: the pick or the entry, not management.
  if (i.exec.losersWithMfe >= 8 && i.exec.neverPositive.length / i.exec.losersWithMfe >= 0.5) {
    const ids = i.exec.neverPositive;
    const losers = trades.filter((t) => r(t) < -0.1 && t.mfe_bucket != null);
    const buckets = ['0', '0.25', '0.5', '1', '1.5', '2', '3+'].map((b) => ({ label: b === '0' ? 'never' : `${b}R`, n: losers.filter((t) => t.mfe_bucket === b).length })).filter((b) => b.n > 0 || b.label === 'never');
    const share = ids.length / i.exec.losersWithMfe;
    out.push(build({
      key: 'exec:never-positive', type: 'never-positive', title: 'Losers never in profit', hitIds: ids, cmp: null,
      costPer: -1 * share, level: i.exec.losersWithMfe >= 20 ? 'likely' : 'hint',
      text: FLAW_TEXT['exec:never-positive'], chart: { kind: 'mfe', buckets },
    }));
  }

  // Tilt: the trade after a loss, and the 2nd+ trade of the day.
  for (const [key, title, test] of [
    ['tilt:after-loss', 'Trading right after a loss', (s: TradeState) => s.after === 'loss'],
    ['tilt:second-plus', 'A 2nd or later trade of the day', (s: TradeState) => (s.tradeNo ?? 0) >= 2],
  ] as const) {
    const withIt = trades.filter((t) => { const s = i.states.get(t.id); return s ? test(s) : false; });
    const set = new Set(withIt.map((t) => t.id));
    const cmp = compare(withIt.map(r), rs.filter((_, k) => !set.has(trades[k].id)), { total: trades.length });
    if (!costs(cmp)) continue;
    const no = (lo: number, hi: number) => trades.filter((t) => { const n = i.states.get(t.id)?.tradeNo ?? 0; return n >= lo && n <= hi; }).map(r);
    const row = (label: string, xs: number[]) => {
      const m = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      const sd = xs.length > 1 && m != null ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : null;
      const half = sd != null ? 1.2816 * sd / Math.sqrt(xs.length) : null;
      return { label, n: xs.length, mean: m, lo: m != null && half != null ? m - half : null, hi: m != null && half != null ? m + half : null };
    };
    out.push(build({
      key, type: 'tilt', title, hitIds: withIt.map((t) => t.id), cmp, text: FLAW_TEXT[key],
      chart: { kind: 'by-trade-no', rows: [row('1st', no(1, 1)), row('2nd', no(2, 2)), row('3rd+', no(3, 99))] },
    }));
  }

  // A filter that does not filter: one grade for everything, or checklist items ticked yes on 90%+ of trades.
  const flat = i.spread.items.filter((x) => x.notFiltering);
  if (i.spread.oneGrade || flat.length >= 2) {
    const ids = trades.slice(-RECENT).map((t) => t.id);
    out.push(build({
      key: 'filter', type: 'filter', title: i.spread.oneGrade ? `Every setup graded ${i.spread.oneGrade}` : 'A checklist that says yes to everything',
      hitIds: ids, cmp: null, costPer: null, processOnly: true, chipKind: 'filter', text: FLAW_TEXT.filter,
      chart: { kind: 'spread', items: i.spread.items.filter((x) => x.share != null).map((x) => ({ label: x.label, share: x.share as number })), grades: i.spread.grades.map((g) => ({ grade: g.grade, share: g.share })) },
    }));
  }

  // Hesitation: setups skipped in real time that score like the ones taken.
  if (i.missed && i.missed.read === 'hesitation' && i.missed.realtime >= 3) {
    const m = i.missed;
    out.push(build({
      key: 'hesitation', type: 'hesitation', title: 'Hesitation: skipping setups you would take', hitIds: m.ids, cmp: null,
      costPer: m.realtime ? -Math.abs(m.rLeft) / m.realtime : null, level: m.realtime >= 10 ? 'likely' : 'hint',
      text: FLAW_TEXT.hesitation, chart: { kind: 'scores', skip: m.skipScore, take: m.takeScore, lo: m.scoreGapLo, hi: m.scoreGapHi },
    }));
  }

  return rankFlaws(out);
}

/** Order by priority; never more than five; never a flaw whose drill would loosen a written rule. */
export function rankFlaws(flaws: readonly Flaw[]): Flaw[] {
  return flaws
    .filter((f) => f.processOnly || (f.costPer != null && f.costPer < 0))
    .filter((f) => !loosensRule(f.drill))
    .sort((a, b) => b.priority - a.priority || b.n - a.n)
    .slice(0, MAX_FLAWS);
}

/**
 * A drill may only add discipline. Words that would relax a written rule
 * (trade outside the killzone, more trades, a wider stop, skip the trigger)
 * keep a flaw off the deck rather than put that advice in front of you.
 */
export function loosensRule(drill: string): boolean {
  return /\b(outside (the )?killzone|more trades|another trade|skip the (trigger|close)|without (the )?(trigger|confirmation|stop)|widen(ing)? (the |my )?stop|move (the |my )?stop (further|wider)|size up|double (size|down)|ignore (the )?news)\b/i.test(drill);
}

function quotesOf(trades: readonly Trade[], ids: readonly string[], i: FlawInputs): Array<{ id: string; date: string; text: string }> {
  void i;
  const set = new Set(ids);
  return trades.filter((t) => set.has(t.id) && (t.lesson ?? '').trim()).slice(-1)
    .map((t) => ({ id: t.id, date: dayOf(t), text: (t.lesson ?? '').trim().split(/(?<=[.!?])\s+/)[0].slice(0, 180) }));
}

const plannedOf = (t: Trade): number | null => (t.planned_rr == null ? null : t.planned_rr === '4+' ? 4 : Number(t.planned_rr));

/* ───────────────────────── working on one flaw ───────────────────────── */

export type WorkStatus = 'active' | 'paused' | 'fixed' | 'relapsed' | 'snoozed';
export interface FlawWork {
  id: string; flaw_key: string; drill_text: string; status: WorkStatus;
  started_at: string; ended_at: string | null;
  /** Hits per trade over the 30 trades before starting. */
  baseline_rate: number | null; baseline_n: number | null;
  /** Snoozed: the number of settled trades at which it comes back. */
  snooze_until: number | null;
}

export interface Progress {
  since: number;
  hitsSince: number;
  /** Per 10 trades. */
  rateBefore: number | null; rateSince: number | null;
  kept: number; broken: number; na: number;
  /** Trades in a row, newest backwards, without the flaw. */
  clean: number;
  graduated: boolean;
}

/** Before vs since, and whether the drill has graduated: 20 clean trades in a row, the drill kept on 90% of them. */
export function progress(work: Pick<FlawWork, 'started_at' | 'baseline_rate' | 'flaw_key'>, trades: readonly Trade[], hit: (t: Trade) => boolean): Progress {
  const since = trades.filter((t) => t.created_at >= work.started_at);
  const hitsSince = since.filter(hit).length;
  let clean = 0;
  for (let k = since.length - 1; k >= 0 && !hit(since[k]); k--) clean++;
  const window = since.slice(-GRADUATE_AFTER);
  const mine = window.filter((t) => t.drill_key === work.flaw_key);
  const kept = mine.filter((t) => t.drill_kept === 'kept').length;
  const broken = mine.filter((t) => t.drill_kept === 'broken').length;
  const na = mine.filter((t) => t.drill_kept === 'n/a').length;
  const counted = window.length - na;
  const graduated = clean >= GRADUATE_AFTER && counted > 0 && kept / counted >= GRADUATE_KEPT;
  return {
    since: since.length, hitsSince,
    rateBefore: work.baseline_rate == null ? null : work.baseline_rate * 10,
    rateSince: since.length ? (hitsSince / since.length) * 10 : null,
    kept, broken, na, clean, graduated,
  };
}

/** A fixed flaw that shows up twice within the 20 trades after it was fixed is back. */
export function relapsed(work: Pick<FlawWork, 'ended_at'>, trades: readonly Trade[], hit: (t: Trade) => boolean): boolean {
  if (!work.ended_at) return false;
  const after = trades.filter((t) => t.created_at > work.ended_at!).slice(0, GRADUATE_AFTER);
  return after.filter(hit).length >= RELAPSE_HITS;
}

/** Hits per trade over the 30 trades before a date: the baseline a drill is measured against. */
export function baseline(trades: readonly Trade[], before: string, hit: (t: Trade) => boolean): { rate: number | null; n: number } {
  const prior = trades.filter((t) => t.created_at < before).slice(-TIMELINE);
  return { rate: prior.length ? prior.filter(hit).length / prior.length : null, n: prior.length };
}

/** A snoozed flaw is hidden until this many settled trades exist. */
export const snoozeUntil = (settledCount: number) => settledCount + SNOOZE_TRADES;

/** The "is this flaw on this trade" test for a stored flaw key — what graduation and relapse read. */
export function hitTest(key: string, i: Pick<FlawInputs, 'themesOf' | 'breaksOf' | 'states' | 'exec'>): (t: Trade) => boolean {
  if (key.startsWith('theme:')) { const id = key.slice(6); return (t) => i.themesOf(t).includes(id); }
  if (key.startsWith('rule:')) { const id = key.slice(5); return (t) => i.breaksOf(t).some((b) => b.id === id); }
  if (key === 'tilt:after-loss') return (t) => i.states.get(t.id)?.after === 'loss';
  if (key === 'tilt:second-plus') return (t) => (i.states.get(t.id)?.tradeNo ?? 0) >= 2;
  if (key === 'exec:early-be') { const s = new Set(i.exec.earlyBe.ids); return (t) => s.has(t.id) || (t.moved_to_be != null && t.moved_to_be !== 'No' && t.exit_reason === 'BE stop' && t.target_hit_later === 'Yes'); }
  if (key === 'exec:never-positive') return (t) => (t.r_multiple ?? 0) < -0.1 && t.mfe_bucket === '0';
  return () => false;
}

/* ───────────────────────── the cover ───────────────────────── */

export interface CoverSplit { real: number; backtest: number; total: number; mostlyReplay: boolean; line: string | null }

/** Whether a blend is mostly replay — the cover leads with the real result, and says so. */
export function coverSplit(settled: readonly Trade[]): CoverSplit {
  const backtest = settled.filter((t) => sourceOf(t.account) === 'backtest').length;
  const real = settled.filter((t) => ['live', 'demo', 'eval'].includes(sourceOf(t.account))).length;
  const total = real + backtest;
  const mostlyReplay = total > 0 && backtest / total > 0.5;
  const line = !mostlyReplay ? null
    : `Mostly replay: ${backtest} of ${total} trades are backtests. Live + demo: ${real} trade${real === 1 ? '' : 's'}${real < 30 ? ' — too early to know.' : '.'}`;
  return { real, backtest, total, mostlyReplay, line };
}
