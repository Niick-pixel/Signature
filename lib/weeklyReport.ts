/**
 * The weekly report (big update, #6): one page, built from the week's own records — no AI, no guesses.
 * R and P&L, the plan kept or not, the rules broken (with the trades), the honest re-grades, the best
 * and worst setups, the drill, and three trades worth re-watching. You add one paragraph. Pure: the
 * server hands it the trades, the preps and the drill names.
 *
 * It describes; it never says which trade to take. A trade that broke a rule is never shown as the
 * good side, whatever it made.
 */
import { isBacktest, isHypothetical, isTaken } from './domain';
import { planMatch, type PlanStatus } from './planMatch';
import type { PrepData } from './prep';
import { brokenFor, dayBreaksByTrade, fieldEras, loggedDay, oldExecutionBreaks } from './review';
import { isRubricV2 } from './decision';
import { DEFAULT_RULE_CONFIG, type DayContext, type RuleConfig } from './ruleBook';
import type { Trade } from './types';
import { weekReview, type WeekReview } from './weekly';

export interface ReportTrade { id: string; date: string; account: string; setup: string; direction: string; r: number; shot: string | null }
export interface WeeklyReport {
  monday: string;
  sunday: string;
  base: WeekReview;
  /** Real money this week: P&L after fees where it was written, and the fees. Null when none was written. */
  money: { net: number | null; fees: number | null; trades: number };
  plan: { in: number; off: number; none: number; reasons: Array<{ text: string; n: number }> };
  /** Each rule broken, with the trades that broke it. */
  broken: Array<{ short: string; trades: ReportTrade[] }>;
  regrades: { same: number; harsher: number; list: Array<ReportTrade & { entry: string; honest: string }> };
  /** By setup, in the world with more trades this week. */
  setups: { world: 'Real' | 'Backtest'; rows: Array<{ setup: string; n: number; netR: number }> };
  drill: { key: string; title: string; kept: number; broken: number; na: number; unanswered: number } | null;
  rewatch: Array<ReportTrade & { why: string }>;
}

const round = (v: number) => Math.round(v * 100) / 100;
const asLine = (t: Trade): ReportTrade => ({ id: t.id, date: t.date.slice(0, 10), account: t.account, setup: t.setup_type, direction: t.direction, r: t.r_multiple ?? 0, shot: t.screenshot_path });

export function weeklyReport(trades: readonly Trade[], monday: string, o: {
  ctxFor?: (day: string) => DayContext; cfg?: RuleConfig; tz?: string;
  prepByDay?: ReadonlyMap<string, PrepData>; drillTitle?: (key: string) => string;
} = {}): WeeklyReport {
  const cfg = o.cfg ?? DEFAULT_RULE_CONFIG; const ctxFor = o.ctxFor ?? (() => ({}));
  const base = weekReview(trades, monday, ctxFor, cfg, o.tz);
  const week = trades.filter((t) => !t.deleted_at && !isHypothetical(t.account) && isTaken(t.outcome) && t.status !== 'Planned' && t.r_multiple != null)
    .filter((t) => { const d = loggedDay(t, o.tz); return d >= monday && d <= base.sunday; })
    .sort((a, b) => a.date.localeCompare(b.date));
  const real = week.filter((t) => !isBacktest(t.account));

  const withMoney = real.filter((t) => t.pnl_dollars != null);
  const money = { net: withMoney.length ? round(withMoney.reduce((s, t) => s + (t.pnl_dollars as number), 0)) : null,
    fees: real.some((t) => t.fees_dollars != null) ? round(real.reduce((s, t) => s + (t.fees_dollars ?? 0), 0)) : null, trades: real.length };

  const plan = { in: 0, off: 0, none: 0, reasons: [] as Array<{ text: string; n: number }> };
  const reasons = new Map<string, number>();
  for (const t of real) {
    const m = planMatch(t, o.prepByDay?.get(t.date.slice(0, 10)));
    plan[m.status as PlanStatus] += 1;
    for (const d of m.diffs) reasons.set(d, (reasons.get(d) ?? 0) + 1);
  }
  plan.reasons = [...reasons].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n).slice(0, 4);

  const breaks = dayBreaksByTrade(trades, ctxFor, cfg); const eras = fieldEras(trades);
  const brokeOf = new Map<string, string[]>();
  const byRule = new Map<string, Trade[]>();
  for (const t of week) {
    const shorts = [...new Set([...brokenFor(t, breaks, cfg, eras), ...(isRubricV2(t) ? [] : oldExecutionBreaks(t))].map((b) => b.short))];
    brokeOf.set(t.id, shorts);
    for (const s of shorts) byRule.set(s, [...(byRule.get(s) ?? []), t]);
  }
  const broken = [...byRule].sort((a, b) => b[1].length - a[1].length).map(([short, ts]) => ({ short, trades: ts.map(asLine) }));

  const regraded = week.filter((t) => t.regrade && !isRubricV2(t));
  const regrades = { same: regraded.filter((t) => t.regrade === t.grade_letter).length, harsher: regraded.filter((t) => t.regrade !== t.grade_letter).length,
    list: regraded.map((t) => ({ ...asLine(t), entry: t.grade_letter, honest: t.regrade as string })) };

  const bt = week.filter((t) => isBacktest(t.account));
  const pool = real.length >= bt.length ? real : bt;
  const set = new Map<string, { n: number; netR: number }>();
  for (const t of pool) { const c = set.get(t.setup_type) ?? { n: 0, netR: 0 }; set.set(t.setup_type, { n: c.n + 1, netR: round(c.netR + (t.r_multiple ?? 0)) }); }
  const setups = { world: (pool === real ? 'Real' : 'Backtest') as 'Real' | 'Backtest',
    rows: [...set].map(([setup, v]) => ({ setup, ...v })).sort((a, b) => b.netR - a.netR) };

  const drilled = week.filter((t) => t.drill_key);
  const lastKey = drilled.length ? drilled[drilled.length - 1].drill_key as string : null;
  const onDrill = drilled.filter((t) => t.drill_key === lastKey);
  const drill = lastKey ? { key: lastKey, title: o.drillTitle?.(lastKey) ?? lastKey,
    kept: onDrill.filter((t) => t.drill_kept === 'kept').length, broken: onDrill.filter((t) => t.drill_kept === 'broken').length,
    na: onDrill.filter((t) => t.drill_kept === 'n/a').length, unanswered: onDrill.filter((t) => t.drill_kept == null).length } : null;

  // Three to re-watch, each for a different reason; a rule broken and lost comes first.
  const picked = new Set<string>(); const rewatch: WeeklyReport['rewatch'] = [];
  const pick = (ts: Trade[], why: (t: Trade) => string) => { const t = ts.find((x) => !picked.has(x.id)); if (t && rewatch.length < 3) { picked.add(t.id); rewatch.push({ ...asLine(t), why: why(t) }); } };
  const byLoss = [...week].sort((a, b) => (a.r_multiple ?? 0) - (b.r_multiple ?? 0));
  pick(byLoss.filter((t) => (t.r_multiple ?? 0) < 0 && (brokeOf.get(t.id) ?? []).length), (t) => `Broke ${brokeOf.get(t.id)![0].toLowerCase()} and lost`);
  pick([...week].filter((t) => t.outcome === 'Loss' && (t.mfe_r ?? 0) >= 1).sort((a, b) => (b.mfe_r ?? 0) - (a.mfe_r ?? 0)), (t) => `Was +${(t.mfe_r ?? 0).toFixed(1)}R before it turned`);
  pick(week.filter((t) => t.grade_override), () => 'Taken against a no-trade grade');
  pick([...week].filter((t) => (t.r_multiple ?? 0) > 0 && !(brokeOf.get(t.id) ?? []).length).sort((a, b) => (b.r_multiple ?? 0) - (a.r_multiple ?? 0)), () => 'Every rule kept — the one to repeat');
  pick(byLoss.filter((t) => (t.r_multiple ?? 0) < 0), () => 'The week\'s biggest loss');

  return { monday, sunday: base.sunday, base, money, plan, broken, regrades, setups, drill, rewatch };
}
