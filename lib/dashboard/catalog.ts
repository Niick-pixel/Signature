/**
 * The Stats dashboard's widgets: every one a view over the engine's outputs
 * (db/statsEngine, lib/edge). A select never computes a statistic; it picks,
 * labels and formats what the engine already found, and says how sure it is.
 *
 * Honesty rules every select follows (and tests/dashboard-catalog checks):
 * - a number that makes a claim carries `claim` (n, its interval, the level);
 * - tone comes from meaning: an effect that rewards breaking a rule is never 'good';
 * - nothing here suggests taking a trade or breaking a written rule.
 */
import { Registry, type WidgetMeta } from './registry';
import type { Source } from './types';
import type { LineVM, Tone, ViewModel } from './vm';
import type { StatsEngine } from '../../db/statsEngine';
import type { Deck } from '../../db/flaws';
import { verdict, VERDICT_LABEL, MIN_N, type VerdictLevel } from '../edge/verdict';
import { rollingExpectancy, underwater, gradeShift, exitReasons } from '../edge/views';
import { rHistogram, whenHeatmap } from '../stats';
import { packRows } from '../edge/ruleLab';
import { sourceOf } from '../edge/fields';
import { DATA_GROUPS, fills } from '../edge/flaws';
import { trialLine } from '../stats';
import { drillMilestone, flawNews, integrityNews, ruleToday, type Attention } from './attention';
import { TRIAL_RUBRIC } from '../rubric';
import type { DeckFlaw } from '../../db/flaws';
import type { FlawVM, ListRow } from './vm';

/** What a select reads: the engine for its scope, plus the flaw deck (built only when asked). */
export interface View extends StatsEngine { source: Source; deck: () => Deck; deckAll: () => Deck }
type Sel = (v: View, cfg: import('./types').WidgetCfg) => ViewModel;
type Att = (v: View, today: string) => Attention | null;

export const R = (v: number | null | undefined, dp = 2) => (v == null || Number.isNaN(v) ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
export const P = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const USD = (v: number | null | undefined) => (v == null ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : /(s|sh|ch|x)$/.test(w) ? 'es' : 's'}`;
const LOG = { href: '/new', hrefLabel: 'Log a trade' };

export const registry = new Registry();
/**
 * Usefulness, ranked once here so the gallery, the default board and the docs agree.
 * 1 — what you look at every day; 2 — worth a flick; anything not listed is 3, a deep dive.
 */
const TIER: Record<string, 1 | 2> = {
  verdict: 1, expectancy: 1, 'p-edge': 1, 'win-rate': 1, net: 1, 'max-dd': 1, 'rules-followed': 1, equity: 1,
  'flaw-1': 1, 'flaw-2': 1, 'flaw-3': 1, 'flaw-4': 1, 'flaw-5': 1, 'point-fix': 1, 'point-keep': 1, 'active-drill': 1,
  'theme-costs': 1, rolling: 1, 'avg-win-loss': 1,
  'profit-factor': 2, 'losing-run': 2, 'by-source': 2, tier: 2, 'eval-odds': 2, underwater: 2, 'real-vs-backtest': 2,
  'r-dist': 2, when: 2, tilt: 2, 'mfe-losers': 2, 'be-cost': 2, 'rule-breaks': 2, 'point-rules': 2, 'point-risk': 2,
  focus: 2, integrity: 2, 'fix-data': 2, losses: 2, 'day-audit': 2, lessons: 2, 'exit-reasons': 2, 'planned-rr': 2, trial: 2,
};
/** About a flaw to fix, or a strength to keep (the faint tint). Everything else is plain data. */
const LEAN: Record<string, 'fix' | 'keep'> = {
  'flaw-1': 'fix', 'flaw-2': 'fix', 'flaw-3': 'fix', 'flaw-4': 'fix', 'flaw-5': 'fix', 'point-fix': 'fix', 'active-drill': 'fix',
  'theme-costs': 'fix', 'rule-breaks': 'fix', lessons: 'fix', losses: 'fix', 'fix-data': 'fix', integrity: 'fix',
  'mfe-losers': 'fix', 'be-cost': 'fix', tilt: 'fix', hesitation: 'fix', missed: 'fix',
  'point-keep': 'keep',
};
const add = (d: Omit<WidgetMeta<ViewModel>, 'select' | 'attention'> & { select: Sel; attention?: Att }) => {
  const att = d.attention;
  return registry.add({ ...d, tier: TIER[d.id] ?? 3, lean: LEAN[d.id],
    select: (e, cfg) => d.select(e as unknown as View, cfg), attention: att ? (e, today) => att(e as unknown as View, today) : undefined });
};
const ruleTodayOf: Att = (v, today) => ruleToday(v.settled, v.breaksOf, today);

/** The expectancy's own verdict (the same test the hero uses). */
function edgeLevel(v: View, m = v.metrics): VerdictLevel | null {
  const ci = m.expectancyCI;
  return ci ? verdict({ n: m.n, pPositive: ci.pPositive, lo80: ci.lo80, hi80: ci.hi80 }, v.thresholds).level : null;
}
const edgeTone = (m: View['metrics']): Tone => {
  const e = m.expectancy; const p = m.expectancyCI?.pPositive ?? 0;
  return e == null ? 'neutral' : e > 0 && p >= 0.9 ? 'good' : e > 0 ? 'watch' : 'bad';
};
const equity = (v: View) => v.curves.all.map((p) => p.cumulative);
const rolling = (v: View, window = 20): LineVM | undefined => {
  const pts = rollingExpectancy(v.rs, window);
  return pts.length < 2 ? undefined : {
    kind: 'line', series: [{ label: `Last ${window}`, values: pts.map((p) => p.mean), tone: 'accent' }],
    band: { lo: pts.map((p) => p.lo80), hi: pts.map((p) => p.hi80), label: '80%' }, zero: true, unit: 'R',
    caption: `Mean R of the last ${window} trades, with its 80% band`,
  };
};

/* ───────────────────────── KPIs ───────────────────────── */

add({
  id: 'expectancy', title: 'Expectancy', category: 'kpi', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', claims: true, minTrades: 1,
  settings: { scope: true, numberFormats: ['R'] },
  help: 'The mean R over every settled trade, breakevens included. The interval comes from 5,000 bootstrap resamples of your own trades; the chip says how sure the engine is that it is above zero.',
  select: (v) => {
    const m = v.metrics; const ci = m.expectancyCI;
    return { kind: 'kpi', value: R(m.expectancy), tone: edgeTone(m), caption: 'per trade', spark: equity(v),
      claim: { n: m.n, lo: ci?.lo80, hi: ci?.hi80, ci: 80, level: edgeLevel(v), unit: 'R' }, chart: rolling(v) };
  },
});

add({
  id: 'p-edge', title: 'P(edge > 0)', category: 'kpi', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', claims: true, minTrades: MIN_N,
  settings: { scope: true },
  help: 'The chance your expectancy is above zero, from the bootstrap. 95% is where luck becomes an unlikely explanation.',
  select: (v) => {
    const m = v.metrics; const p = m.expectancyCI?.pPositive ?? null;
    const more = m.tradesFor95 != null ? Math.max(0, m.tradesFor95 - m.n) : null;
    return { kind: 'kpi', value: P(p), tone: p == null ? 'neutral' : p >= 0.9 && (m.expectancy ?? 0) > 0 ? 'good' : p >= 0.5 ? 'watch' : 'bad',
      caption: 'chance the edge is real', compare: p != null && p >= 0.95 ? 'past 95%' : more != null && more > 0 ? `≈ ${more} more trades to 95%` : (m.expectancy ?? 0) <= 0 ? 'not above zero' : undefined,
      claim: { n: m.n, lo: m.expectancyCI?.lo80, hi: m.expectancyCI?.hi80, ci: 80, level: edgeLevel(v), unit: 'R' } };
  },
});

add({
  id: 'win-rate', title: 'Win rate', category: 'kpi', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', claims: true, minTrades: 1,
  settings: { scope: true },
  help: 'Wins over settled trades, against the win rate you need at your average win and loss to break even. The interval is a 95% Wilson interval.',
  select: (v) => {
    const m = v.metrics; const ok = m.winRate != null && m.breakevenWinRate != null;
    const above = ok && m.winRate! > m.breakevenWinRate!;
    return { kind: 'kpi', value: P(m.winRate), tone: !ok ? 'neutral' : above ? (m.n >= 30 ? 'good' : 'watch') : 'bad',
      caption: 'of trades won', compare: m.breakevenWinRate != null ? `${P(m.breakevenWinRate)} to break even` : undefined,
      claim: { n: m.n, lo: m.winRateCI?.lo, hi: m.winRateCI?.hi, ci: 95, unit: '%' },
      chart: ok ? { kind: 'bars', items: [
        { label: 'You win', value: m.winRate!, display: P(m.winRate), tone: 'accent', lo: m.winRateCI?.lo, hi: m.winRateCI?.hi },
        { label: 'Break even', value: m.breakevenWinRate!, display: P(m.breakevenWinRate), tone: 'muted' },
      ], max: 1, horizontal: true } : undefined };
  },
});

add({
  id: 'avg-win-loss', title: 'Average win / loss', category: 'kpi', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', claims: true, minTrades: 2,
  settings: { scope: true },
  help: 'The mean R of your winners and of your losers, and the payoff between them. A small sample swings these a lot.',
  select: (v) => {
    const m = v.metrics;
    const payoff = m.avgWin != null && m.avgLoss ? m.avgWin / Math.abs(m.avgLoss) : null;
    return { kind: 'kpi', value: `${R(m.avgWin)} / ${R(m.avgLoss)}`, tone: 'neutral', caption: 'average win / loss',
      compare: payoff != null ? `payoff ${payoff.toFixed(2)}` : undefined, claim: { n: m.n, unit: 'R' },
      chart: { kind: 'bars', items: rHistogram(v.settled).map((b) => ({ label: b.label, value: b.count, display: String(b.count), tone: b.to <= 0 ? 'bad' : b.from >= 0 ? 'good' : 'muted' })) } };
  },
});

add({
  id: 'profit-factor', title: 'Profit factor', category: 'kpi', kind: 'kpi', sizes: ['S'], defaultSize: 'S', claims: true, minTrades: 2,
  settings: { scope: true },
  help: 'R won divided by R lost. Above 1 makes money; a handful of trades can put it anywhere.',
  select: (v) => {
    const pf = v.metrics.profitFactor;
    return { kind: 'kpi', value: pf == null ? '—' : pf.toFixed(2), tone: pf == null ? 'neutral' : pf > 1 ? (v.metrics.n >= 30 ? 'good' : 'watch') : 'bad',
      caption: 'R won ÷ R lost', claim: { n: v.metrics.n } };
  },
});

add({
  id: 'net', title: 'Net result', category: 'kpi', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', claims: true, minTrades: 1,
  settings: { scope: true, numberFormats: ['R', '$'] },
  help: 'What the trades added up to, in R or in dollars (dollars only for trades with a P&L logged).',
  select: (v, cfg) => {
    const m = v.metrics; const usd = cfg.numberFormat === '$';
    const val = usd ? m.netMoney : m.netR;
    return { kind: 'kpi', value: usd ? USD(val) : R(val, 1), tone: val == null ? 'neutral' : val > 0 ? (m.n >= 30 ? 'good' : 'watch') : val < 0 ? 'bad' : 'neutral',
      caption: usd ? `over ${plural(m.pricedN, 'priced trade')}` : `over ${plural(m.n, 'trade')}`, spark: equity(v), claim: { n: usd ? m.pricedN : m.n, unit: usd ? '$' : 'R' },
      chart: { kind: 'line', series: [{ label: 'Equity', values: equity(v), tone: 'accent' }], zero: true, unit: 'R' } };
  },
});

add({
  id: 'max-dd', title: 'Max drawdown', category: 'kpi', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', claims: true, minTrades: 2,
  settings: { scope: true },
  help: 'The deepest fall from a high, in R, against 10,000 reshuffles of your own trades: deeper than 90% of them means something changed.',
  select: (v) => {
    const m = v.metrics; const uw = underwater(equity(v));
    return { kind: 'kpi', value: R(m.maxDrawdownR, 1), tone: v.cone ? (v.cone.ddPercentile >= 0.1 ? 'neutral' : 'bad') : 'neutral',
      caption: m.stillUnderwater ? 'still under water' : m.recoveryTrades != null ? `recovered in ${plural(m.recoveryTrades, 'trade')}` : 'from the highest high',
      compare: v.cone ? `typical ${R(v.cone.maxDD.p50, 1)}` : undefined, spark: uw, claim: { n: m.n, unit: 'R' },
      chart: { kind: 'line', series: [{ label: 'Under water', values: uw, tone: 'bad' }], zero: true, unit: 'R' } };
  },
});

add({
  id: 'losing-run', title: 'Longest losing run', category: 'kpi', kind: 'kpi', sizes: ['S'], defaultSize: 'S', claims: true, minTrades: 5,
  settings: { scope: true },
  help: 'Your longest run of losses in a row, against what reshuffles of your own trades produce. A run like the expected one is part of your numbers, not a sign.',
  select: (v) => {
    const m = v.metrics; const c = v.cone;
    return { kind: 'kpi', value: String(m.longestLosingStreak), tone: c ? (c.streakPercentile >= 0.1 ? 'neutral' : 'bad') : 'neutral',
      caption: 'losses in a row', compare: c ? `expected ${Math.round(c.streak.p50)} · 90% up to ${Math.round(c.streak.p95)}` : undefined, claim: { n: m.n } };
  },
});

add({
  id: 'by-source', title: 'Trades by source', category: 'kpi', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', minTrades: 0,
  settings: { scope: true },
  help: 'Where the trades in these numbers came from. Replay carries no fear, so a total that is mostly backtests is not a live result.',
  select: (v) => {
    const mix = (['live', 'demo', 'eval', 'backtest'] as const).map((s) => [s, v.settled.filter((t) => sourceOf(t.account) === s).length] as const);
    const real = mix.filter(([s]) => s !== 'backtest').reduce((a, [, n]) => a + n, 0); const bt = mix[3][1];
    return { kind: 'kpi', value: String(v.settled.length), tone: bt > real ? 'watch' : 'neutral', caption: 'settled trades',
      compare: mix.filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(' · ') || 'none yet',
      chart: { kind: 'bars', items: mix.map(([s, n]) => ({ label: s, value: n, display: String(n), tone: s === 'backtest' ? 'muted' : 'accent' })) } };
  },
});

add({
  id: 'rules-followed', title: 'Rules followed', category: 'kpi', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', claims: true, minTrades: 1,
  settings: { scope: true }, attention: ruleTodayOf,
  help: 'Trades with nothing broken in your rule book (trade and day rules, checked automatically and by you), and what each side made. Breaking a rule is never shown as the better side.',
  select: (v) => {
    const a = v.adh; const s = v.split;
    const rate = a.rate;
    return { kind: 'kpi', value: P(rate), tone: rate == null ? 'neutral' : rate >= 0.8 ? 'good' : rate >= 0.6 ? 'watch' : 'bad',
      caption: 'of trades inside every rule', compare: `${a.kept} of ${a.n}`, claim: { n: a.n, level: s?.verdict.level ?? null },
      chart: s ? { kind: 'bars', horizontal: true, items: [
        { label: 'Rules kept', value: s.shrunk, display: `${R(s.shrunk)} · n ${s.n}`, tone: 'accent' },
        // Never 'good', whatever it made: a better result from breaking rules is a warning, not a reward.
        { label: 'A rule broken', value: s.restShrunk, display: `${R(s.restShrunk)} · n ${s.restN}`, tone: s.restShrunk > s.shrunk ? 'watch' : 'bad' },
      ], marker: { value: 0, label: '0R' } } : undefined };
  },
});

add({
  id: 'tier', title: 'Maturity tier', category: 'kpi', kind: 'text', sizes: ['S'], defaultSize: 'S', minTrades: 0,
  settings: {},
  help: 'The engine unlocks more as your sample grows: below 30 trades most findings stay Too early, by design.',
  select: (v) => {
    const t = v.mat;
    return { kind: 'text', headline: `Tier ${t.tier}`, tone: 'neutral',
      body: t.toNext != null ? `${plural(t.toNext, 'trade')} to tier ${t.tier + 1}${t.nextUnlocks ? `: ${t.nextUnlocks.toLowerCase()}` : ''}` : 'Everything is unlocked.',
      meter: { kind: 'share', value: t.progress } };
  },
});

add({
  id: 'eval-odds', title: 'Eval odds', category: 'kpi', kind: 'custom', view: 'eval', sizes: ['M', 'L'], defaultSize: 'M', claims: true, minTrades: 10, lazy: true,
  settings: { scope: true },
  help: 'A Monte Carlo of a prop evaluation from your own results: the chance to pass, to bust, and the median days to pass. Pick your account or a common evaluation.',
  select: (v) => ({ kind: 'custom', view: 'eval', data: { rows: packRows(v.lab), presets: v.evalPresets }, claim: { n: v.settled.length } }),
});

/* ───────────────────────── charts ───────────────────────── */

add({
  id: 'equity', title: 'Equity', category: 'chart', kind: 'custom', view: 'equity', sizes: ['L', 'XL'], defaultSize: 'L', claims: true, minTrades: 2,
  settings: { scope: true },
  help: 'Your equity in R, with the cone of 10,000 reshuffles of your own trades (where a run like yours usually lands) and the split between trades that kept every rule and those that broke one.',
  select: (v) => ({ kind: 'custom', view: 'equity', claim: { n: v.metrics.n },
    data: { curves: v.curves, rs: v.rs, m: v.metrics, split: v.split, adherence: v.adh, cone: v.cone } }),
});

add({
  id: 'underwater', title: 'Under water', category: 'chart', kind: 'line', sizes: ['M'], defaultSize: 'M', minTrades: 2,
  settings: { scope: true, chartStyles: ['area', 'line'] },
  help: 'How far below its own high your equity was after each trade.',
  select: (v) => ({ kind: 'line', series: [{ label: 'Below the high', values: underwater(equity(v)), tone: 'bad' }], zero: true, unit: 'R',
    caption: `Deepest ${R(v.metrics.maxDrawdownR, 1)}${v.metrics.stillUnderwater ? ' · still under water' : ''}`, claim: { n: v.metrics.n } }),
});

add({
  id: 'real-vs-backtest', title: 'Real vs backtest', category: 'chart', kind: 'line', sizes: ['M', 'L'], defaultSize: 'M', claims: true,
  settings: { chartStyles: ['line', 'area'] },
  help: 'Your real equity (live, demo, eval) and your replay equity on one R axis, never blended. A gap is execution under pressure, or replay being kind.',
  select: (v) => {
    const c = v.deckAll().cover;
    if (c.real.n + c.backtest.n < 2) return { kind: 'line', series: [], tooEarly: { text: 'Needs settled trades in both real accounts and backtests.', ghost: 'line', ...LOG } };
    return { kind: 'line', zero: true, unit: 'R',
      series: [{ label: `Real ${R(c.real.expectancy)}/trade · n ${c.real.n}`, values: c.curves.real, tone: 'accent' }, { label: `Backtest ${R(c.backtest.expectancy)}/trade · n ${c.backtest.n}`, values: c.curves.backtest, tone: 'muted' }],
      caption: c.split.line ?? undefined, claim: { n: c.real.n + c.backtest.n } };
  },
});

add({
  id: 'r-dist', title: 'R distribution', category: 'chart', kind: 'bars', sizes: ['M'], defaultSize: 'M', minTrades: 3,
  settings: { scope: true },
  help: 'How your results spread out: how many trades landed in each band of R.',
  select: (v) => ({ kind: 'bars', claim: { n: v.settled.length }, caption: 'Trades per band of R',
    items: rHistogram(v.settled).map((b) => ({ label: b.label, value: b.count, display: String(b.count), tone: b.to <= 0 ? 'bad' : b.from >= 0 ? 'good' : 'muted' })) }),
});

add({
  id: 'rolling', title: 'Rolling expectancy', category: 'chart', kind: 'line', sizes: ['M'], defaultSize: 'M', claims: true, minTrades: 20,
  settings: { scope: true, chartStyles: ['line', 'area'], fields: [{ key: 'window', label: 'Window (trades)', kind: 'number', min: 10, max: 100, step: 5, default: 20 }] },
  help: 'The mean R of your last N trades at each point, with its 80% band: is the edge holding, growing or fading?',
  select: (v, cfg) => {
    const w = Number(cfg.extra?.window ?? 20);
    const l = rolling(v, w);
    return l ? { ...l, claim: { n: v.rs.length } } : { kind: 'line', series: [], tooEarly: { text: `Needs ${w - v.rs.length + 1} more settled trades.`, ghost: 'line', ...LOG } };
  },
});

add({
  id: 'when', title: 'Day and hour', category: 'chart', kind: 'heat', sizes: ['M', 'L'], defaultSize: 'M', minTrades: 10,
  settings: { scope: true },
  help: 'Average R by weekday and entry hour (New York time). Faded where fewer than 5 trades: a cell that small is noise, not a schedule.',
  select: (v) => {
    const cells = whenHeatmap(v.settled.filter((t) => sourceOf(t.account) !== 'backtest' || v.source === 'backtest'));
    const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
    const days = [1, 2, 3, 4, 5];
    return { kind: 'heat', rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], cols: hours.map((h) => `${h}:00`), claim: { n: cells.reduce((a, c) => a + c.count, 0) },
      cells: cells.filter((c) => days.includes(c.day)).map((c) => ({ r: days.indexOf(c.day), c: hours.indexOf(c.hour), value: c.totalR / c.count, n: c.count, display: R(c.totalR / c.count, 1) })),
      caption: 'Average R per trade · faded under 5 trades' };
  },
});

add({
  id: 'grade-calibration', title: 'Grade calibration', category: 'chart', kind: 'bars', sizes: ['M'], defaultSize: 'M', claims: true, minTrades: 8,
  settings: { scope: true },
  help: 'What each grade made, from grades locked before the outcome only, shrunk toward your mean with its 80% interval. Better grades should earn more; if they don\'t, the grade isn\'t reading the setup.',
  select: (v) => {
    const rows = v.quality.clean.rows;
    if (!rows.length) return { kind: 'bars', items: [], tooEarly: { text: 'Needs trades graded before the outcome.', ghost: 'bars', ...LOG } };
    return { kind: 'bars', horizontal: true, marker: { value: 0, label: '0R' }, claim: { n: v.quality.cleanN, ci: 80 },
      items: rows.map((r) => ({ label: r.grade, value: r.shrunk, display: `${R(r.shrunk)} · n ${r.n}`, tone: 'accent', lo: r.lo80, hi: r.hi80 })),
      caption: 'Graded before the outcome · shrunk, 80% interval' };
  },
});

add({
  id: 'grade-shift', title: 'Grade before vs after', category: 'chart', kind: 'bars', sizes: ['M'], defaultSize: 'M', minTrades: 3,
  settings: { scope: true },
  help: 'Your grade at entry against the honest re-grade after the close. Re-grades can only be harsher; many graded down means the grade at entry is generous.',
  select: (v) => {
    const s = gradeShift(v.settled);
    if (s.n < 3) return { kind: 'bars', items: [], tooEarly: { text: `Needs ${3 - s.n} more re-graded trades.`, ghost: 'bars', href: '/blind', hrefLabel: 'Re-grade' } };
    return { kind: 'bars', claim: { n: s.n }, caption: `${s.n} trades with both grades`,
      items: [{ label: 'Graded down', value: s.down, display: String(s.down), tone: 'watch' }, { label: 'Same', value: s.same, display: String(s.same), tone: 'accent' }, { label: 'Up', value: s.up, display: String(s.up), tone: 'muted' }] };
  },
});

add({
  id: 'spread', title: 'Does your filter filter?', category: 'chart', kind: 'bars', sizes: ['M', 'T'], defaultSize: 'M', minTrades: 8,
  settings: { scope: true },
  help: 'How often each checklist item is ticked yes, before the outcome. An item yes on more than 90% of trades cannot separate good setups from bad.',
  select: (v) => {
    const sp = v.quality.spread;
    const items = sp.items.filter((i) => i.share != null);
    if (!items.length) return { kind: 'bars', items: [], tooEarly: { text: 'Needs checklist answers on 10+ trades.', ghost: 'bars', ...LOG } };
    return { kind: 'bars', horizontal: true, max: 1, marker: { value: 0.9, label: '90%' }, claim: { n: sp.gradeN },
      caption: sp.oneGrade ? `Every pre-graded trade is ${sp.oneGrade}` : 'Share ticked yes · amber above 90%',
      items: items.map((i) => ({ label: i.label, value: i.share!, display: P(i.share), tone: i.notFiltering ? 'watch' : 'accent' })) };
  },
});

add({
  id: 'weights', title: 'Learned weights', category: 'chart', kind: 'custom', view: 'quality', sizes: ['L'], defaultSize: 'L', claims: true, minTrades: 8,
  settings: { scope: true },
  help: 'Do your grades mean anything? Grades locked before the outcome against those given after it, grade drift, and a score learned from your own trades — tested out of sample.',
  select: (v) => ({ kind: 'custom', view: 'quality', claim: { n: v.settled.length },
    data: { q: v.quality, model: v.model, thumbs: v.thumbsOf(v.quality.clean.rows.flatMap((r) => r.tradeIds.slice(0, 12))),
      weightsLocked: v.mat.n >= 100 ? null : `Under 100 trades the learned weights barely leave yours (40 pseudo-trades of prior) — ${100 - v.mat.n} to go before they can visibly diverge.` } }),
});

add({
  id: 'anatomy', title: 'Setup anatomy', category: 'chart', kind: 'custom', view: 'anatomy', sizes: ['L', 'XL'], defaultSize: 'L', claims: true, minTrades: 8,
  settings: { scope: true },
  help: 'Every level of every pre-trade field against the rest of your trades: shrunk toward your mean, an interval on each, Benjamini–Hochberg across the table. Only fields known before the entry are allowed in.',
  select: (v) => ({ kind: 'custom', view: 'anatomy', claim: { n: v.engine.n },
    data: { rows: v.visibleRows, mu: v.engine.explorer.mu, tests: v.engine.explorer.tests, hidden: v.engine.explorer.rows.length - v.visibleRows.length,
      thumbs: v.thumbsOf(v.visibleRows.flatMap((r) => r.tradeIds)) } }),
});

add({
  id: 'tilt', title: 'Tilt', category: 'chart', kind: 'heat', sizes: ['M'], defaultSize: 'M', claims: true, minTrades: 10,
  settings: { scope: true },
  help: 'Expectancy by how many losses you had already taken that day and which trade of the day it was, shrunk toward your mean. Real trading days only.',
  select: (v) => {
    const rows = ['0', '1', '2+'] as const; const cols = ['1st', '2nd', '3rd+'] as const;
    return { kind: 'heat', rows: ['No loss yet', 'After 1 loss', 'After 2+'], cols: ['1st trade', '2nd', '3rd+'], claim: { n: v.tilt.cells.reduce((a, c) => a + c.n, 0) },
      cells: v.tilt.cells.filter((c) => c.n > 0).map((c) => ({ r: rows.indexOf(c.losses), c: cols.indexOf(c.tradeNo), value: c.shrunk, n: c.n, display: R(c.shrunk) })),
      caption: 'Shrunk R per trade · faded under 5 trades' };
  },
});

add({
  id: 'mfe-losers', title: 'Losers: how far they went your way', category: 'chart', kind: 'bars', sizes: ['M'], defaultSize: 'M', minTrades: 0,
  settings: { scope: true },
  help: 'From the max-in-favour tap on your losers: a loser that was 1R in profit first is a management leak; one that never went your way is an entry or setup problem. Diagnosis only.',
  select: (v) => {
    const e = v.exec; const lm = e.losersWithMfe;
    if (lm < 8) return { kind: 'bars', items: [], tooEarly: { text: `Needs ${8 - lm} more losers with "Max in favour" logged.`, ghost: 'bars', ...LOG } };
    const mid = lm - e.mgmtLeak.length - e.neverPositive.length;
    return { kind: 'bars', claim: { n: lm }, caption: `${lm} of ${e.losers} losers have it logged`,
      items: [{ label: 'Never in profit', value: e.neverPositive.length, display: String(e.neverPositive.length), tone: 'watch' },
        { label: 'In between', value: mid, display: String(mid), tone: 'muted' },
        { label: '1R in profit first', value: e.mgmtLeak.length, display: String(e.mgmtLeak.length), tone: 'bad' }] };
  },
});

add({
  id: 'be-cost', title: 'Breakeven cost', category: 'chart', kind: 'kpi', sizes: ['S', 'M'], defaultSize: 'S', minTrades: 0,
  settings: { scope: true },
  help: 'Trades moved to breakeven, stopped out there, after which price went on to your target: what those breakevens gave up, in R.',
  select: (v) => {
    const b = v.exec.earlyBe;
    return { kind: 'kpi', value: R(-b.costR, 1), tone: b.ids.length ? 'bad' : 'neutral', caption: 'given up to early breakeven',
      compare: `${plural(b.ids.length, 'trade')} hit the target after`, claim: { n: b.ids.length } };
  },
});

add({
  id: 'rule-breaks', title: 'Rule breaks', category: 'chart', kind: 'custom', view: 'timeline', sizes: ['M', 'L'], defaultSize: 'M', minTrades: 1,
  settings: { scope: true }, attention: ruleTodayOf,
  help: 'Each rule you broke over your last 30 trades, one dot per trade: filled where it was broken. Is it getting rarer?',
  select: (v) => {
    const last = v.settled.slice(-30);
    const counts = v.ledger.rules.filter((r) => r.auto + r.self > 0).sort((a, b) => (b.auto + b.self) - (a.auto + a.self)).slice(0, 5);
    return { kind: 'custom', view: 'timeline', claim: { n: last.length },
      data: { rows: counts.map((r) => ({ label: r.short, total: r.auto + r.self, cells: last.map((t) => ({ id: t.id, hit: v.breaksOf(t).some((b) => b.id === r.id) })) })), n: last.length } };
  },
});

add({
  id: 'theme-costs', title: 'Mistake theme costs', category: 'chart', kind: 'bars', sizes: ['M', 'L'], defaultSize: 'M', claims: true, minTrades: 8,
  settings: { scope: true },
  help: 'What each mistake theme in your lessons costs per time, shrunk toward zero, with its 80% range. Written after the outcome: a diagnosis, never a prediction.',
  select: (v) => {
    const th = v.ledger.themes.filter((t) => t.cmp).slice(0, 8);
    if (!th.length) return { kind: 'bars', items: [], tooEarly: { text: 'Needs lessons on 8+ trades.', ghost: 'bars', ...LOG } };
    return { kind: 'bars', horizontal: true, marker: { value: 0, label: '0R' }, claim: { n: v.settled.length, ci: 80 }, caption: 'Cost per time · shrunk · 80% range',
      items: th.map((t) => ({ label: t.title, value: t.cmp!.diff, display: `${R(t.cmp!.diff)} · ${t.n}×`, lo: t.cmp!.lo80, hi: t.cmp!.hi80,
        // A mistake that "paid" is never shown as good.
        tone: t.cmp!.diff < 0 ? 'bad' : 'muted', sub: VERDICT_LABEL[t.cmp!.verdict.level] })) };
  },
});

add({
  id: 'hesitation', title: 'Hesitation', category: 'chart', kind: 'bars', sizes: ['M'], defaultSize: 'M', claims: true, minTrades: 0,
  settings: { scope: true },
  help: 'Missed setups logged in real time against the ones you took: if your skips score like your takes, you are hesitating; if lower, your filter works. Hindsight entries are left out.',
  select: (v) => {
    const m = v.missed;
    if (m.realtime < 3) return { kind: 'bars', items: [], tooEarly: { text: `Needs ${3 - m.realtime} more missed setups logged in real time.`, ghost: 'bars', href: '/new?missed=1', hrefLabel: 'Log a missed setup' } };
    const read = { hesitation: 'Your skips score like your takes: hesitation.', filter: 'Your skips score lower: the filter works.', unclear: 'Not clear yet.', 'too-few': 'Too few to read.' }[m.read];
    return { kind: 'bars', claim: { n: m.realtime, lo: m.scoreGapLo, hi: m.scoreGapHi, ci: 80, unit: '' }, caption: read,
      items: [{ label: 'Skipped', value: m.skipScore ?? 0, display: m.skipScore == null ? '—' : m.skipScore.toFixed(0), tone: 'muted' },
        { label: 'Taken', value: m.takeScore ?? 0, display: m.takeScore == null ? '—' : m.takeScore.toFixed(0), tone: 'accent' }] };
  },
});

add({
  id: 'rule-lab', title: 'Rule Lab', category: 'chart', kind: 'custom', view: 'rulelab', sizes: ['L', 'XL'], defaultSize: 'L', claims: true, minTrades: 30, lazy: true,
  settings: { scope: true },
  help: 'What would have happened under a stricter rule: expectancy with its interval, the difference against what you took, and P(better). An experiment, never a verdict; none needing more than 200 trades is proposed.',
  select: (v) => ({ kind: 'custom', view: 'rulelab', claim: { n: v.lab.length },
    data: { rows: packRows(v.lab), each: Object.fromEntries(Object.entries(v.labEach).map(([k, r]) => [k, { ...r, curve: [] }])) } }),
});

add({
  id: 'planned-rr', title: 'Planned vs achieved R:R', category: 'chart', kind: 'bars', sizes: ['M'], defaultSize: 'M', minTrades: 0,
  settings: { scope: true },
  help: 'For each planned R:R, the mean R you actually got and how many reached their target.',
  select: (v) => {
    const p = v.exec.planned;
    if (p.reduce((a, x) => a + x.n, 0) < 5) return { kind: 'bars', items: [], tooEarly: { text: 'Needs planned R:R on 5+ trades.', ghost: 'bars', ...LOG } };
    return { kind: 'bars', marker: { value: 0, label: '0R' }, claim: { n: p.reduce((a, x) => a + x.n, 0) }, caption: 'Mean R achieved, by plan',
      items: p.map((x) => ({ label: `${x.rr}R`, value: x.meanR, display: R(x.meanR), sub: `${x.reached}/${x.n} reached`, tone: 'accent' })) };
  },
});

add({
  id: 'exit-reasons', title: 'How trades ended', category: 'chart', kind: 'bars', sizes: ['M'], defaultSize: 'M', minTrades: 0,
  settings: { scope: true },
  help: 'How your settled trades ended, with the mean R of each. Descriptive only: an exit is known after the outcome, so it is never a finding about what wins.',
  select: (v) => {
    const x = exitReasons(v.settled);
    if (x.rows.reduce((a, r) => a + r.n, 0) < 5) return { kind: 'bars', items: [], tooEarly: { text: 'Needs an exit reason on 5+ trades.', ghost: 'bars', ...LOG } };
    return { kind: 'bars', horizontal: true, max: 1, claim: { n: x.n - x.unknown }, caption: x.unknown ? `${x.unknown} without an exit reason` : 'Share of trades',
      items: x.rows.map((r) => ({ label: r.reason, value: r.share, display: `${r.n} · ${R(r.meanR)}`, tone: 'muted' })) };
  },
});

add({
  id: 'backtest-gap', title: 'Backtest vs live', category: 'data', kind: 'list', sizes: ['M', 'L'], defaultSize: 'M', claims: true, minTrades: 8,
  settings: { scope: true },
  help: 'The same setup level live and in replay. A big gap on the same setup means execution under pressure, not the setup.',
  select: (v) => ({ kind: 'list', empty: v.btEligible ? 'No setup level has enough trades in both yet.' : 'Shown on real accounts, when you have backtests.',
    rows: v.btGap.map((g) => ({ key: g.label, title: g.label, sub: `live ${R(g.live)} (${g.liveN}) · replay ${R(g.bt)} (${g.btN})`, value: `gap ${R(g.gap)}`, tone: 'neutral' as Tone })),
    claim: { n: v.settled.length } }),
});

/* ───────────────────────── insight ───────────────────────── */

add({
  id: 'verdict', title: 'In one line', category: 'insight', kind: 'text', sizes: ['W', 'M'], defaultSize: 'W', claims: true, minTrades: 1,
  settings: { scope: true },
  help: 'Your edge, the one thing to fix first and what it takes to be sure, in one sentence. When most of the trades in view are backtests it leads with the real result, never the blend.',
  select: (v) => {
    const edge = v.summary.points.find((p) => p.id === 'edge');
    // The colour follows what the sentence leads with: the real result when most trades are replays, and a replay
    // result alone is never "good" (it is not money made).
    const rm = v.realMetrics;
    const tone: Tone = !rm ? (edge?.tone ?? 'neutral') as Tone
      : rm.expectancy == null ? ((edge?.tone === 'bad' ? 'bad' : 'watch') as Tone)
        : rm.expectancy < 0 ? 'bad' : edgeLevel(v, rm) === 'likely' || edgeLevel(v, rm) === 'confirmed' ? 'good' : 'watch';
    // n is the sample the sentence speaks about: the real trades when it leads with them, else every trade in view.
    const cm = rm && rm.n > 0 ? rm : v.metrics;
    return { kind: 'text', headline: v.summary.line, tone, claim: { n: cm.n, level: edgeLevel(v, cm) } };
  },
});

const point = (id: 'fix' | 'keep' | 'rules' | 'risk', title: string, help: string) => add({
  id: `point-${id}`, title, category: 'insight', kind: 'text', sizes: ['S', 'M'], defaultSize: 'M', claims: true, minTrades: 1,
  settings: { scope: true }, help,
  select: (v) => {
    const p = v.summary.points.find((x) => x.id === id);
    if (!p) return { kind: 'none' };
    const item = id === 'fix' ? v.focus.leak : id === 'keep' ? v.focus.strength : null;
    return { kind: 'text', headline: p.headline, body: p.body, tone: p.tone,
      meter: p.meter?.kind === 'share' ? { kind: 'share', value: p.meter.value } : p.meter?.kind === 'gauge' ? { kind: 'range', lo: p.meter.lo, hi: p.meter.hi, mid: p.meter.value, min: p.meter.min, max: p.meter.max } : undefined,
      claim: item ? { n: item.n, lo: item.cmp.lo80, hi: item.cmp.hi80, ci: 80, level: item.cmp.verdict.level, unit: 'R' } : { n: v.settled.length } };
  },
});
point('fix', 'Fix first', 'The one leak costing you most: controllable, frequent in your last 20 trades, and with the evidence behind it. "Not proven yet" when it isn\'t.');
point('keep', 'Keep doing', 'The habit that pays most, read only from what you knew before the entry. Never a broken rule.');
point('rules', 'Following your rules', 'Share of trades inside every rule, and what each side made.');
point('risk', 'Risk', 'Is your drawdown normal for your results? Your worst fall and longest losing run against 10,000 reshuffles of your own trades.');

add({
  id: 'focus', title: "This week's experiment", category: 'insight', kind: 'text', sizes: ['S', 'M'], defaultSize: 'M', claims: true, minTrades: 8,
  settings: { scope: true },
  help: 'One change to test on your next trades, from the biggest leak or the Rule Lab. An experiment, not a verdict: none that would need more than 200 trades to tell apart is proposed.',
  select: (v) => {
    const x = v.focus.experiment;
    if (!x) return { kind: 'text', headline: 'No experiment is testable at your sample size yet', tone: 'neutral', body: 'A gap this small would take more than 200 trades to tell apart. Keep logging.', claim: { n: v.settled.length } };
    return { kind: 'text', headline: x.text, tone: 'watch', body: `Test it on the next ${x.n} trades, then compare. From ${x.from.toLowerCase()}.`, claim: { n: v.settled.length, level: v.focus.leak?.cmp.verdict.level ?? null } };
  },
});

add({
  id: 'integrity', title: 'Data checks', category: 'insight', kind: 'list', sizes: ['S', 'M', 'T'], defaultSize: 'S', minTrades: 0,
  settings: { scope: true }, attention: (v) => integrityNews(v.issues),
  help: 'Anything in your data that would make a number wrong: hindsight grades, trades with no R, retired fields. Each with links to fix.',
  select: (v) => ({ kind: 'list', empty: 'Nothing in your data that would make a number wrong.',
    rows: v.issues.map((i) => ({ key: i.id, title: i.text, tone: (i.tone === 'bug' ? 'bad' : i.tone === 'warn' ? 'watch' : 'neutral') as Tone, href: i.links?.[0]?.href })) }),
});

add({
  id: 'health', title: 'Engine health', category: 'insight', kind: 'custom', view: 'health', sizes: ['M', 'L'], defaultSize: 'L', minTrades: 0,
  settings: {},
  help: 'The engine grades itself: every claim above Too early is recorded and re-checked on the next 30 trades logged after it. If its claims don\'t hold, its thresholds rise.',
  select: (v) => ({ kind: 'custom', view: 'health',
    data: { claims: v.claims, brier: v.brierScore, thresholds: v.thresholds, changes: v.thresholdChanges, completeness: v.preCompleteness, mat: v.mat, blind: v.blind } }),
});

add({
  id: 'trial', title: 'Rubric trial', category: 'insight', kind: 'text', sizes: ['S', 'W'], defaultSize: 'S', claims: true, minTrades: 0,
  settings: {},
  help: 'The current rubric trial: progress is capped at its target, and once reached the verdict uses every setup logged, not only the first ones.',
  select: (v) => {
    if (!v.trial || TRIAL_RUBRIC == null) return { kind: 'text', headline: 'No rubric trial running', tone: 'neutral' };
    const t = v.trial;
    return { kind: 'text', headline: trialLine(TRIAL_RUBRIC, t), tone: t.ready ? (t.positive ? 'good' : 'bad') : 'neutral',
      meter: { kind: 'share', value: Math.min(1, t.n / 30) }, claim: { n: t.n } };
  },
});

/* ───────────────────────── flaws and drills ───────────────────────── */

function flawVM(v: View, deck: Deck, f: DeckFlaw, index: number): FlawVM {
  const happening = f.cmp
    ? `${plural(f.n, 'trade')}, ${f.recent} in your last 20. With it: ${R(f.cmp.shrunk)} a trade; without: ${R(f.cmp.restShrunk)}.`
    : f.type === 'filter' ? 'Nearly every setup gets the same answer, so the grade cannot separate good setups from bad.'
      : f.quotes.length ? `You wrote this ${f.quotes.length} times in your last 30 trades.` : `${plural(f.n, 'trade')}, ${f.recent} in your last 20.`;
  return {
    kind: 'flaw', key: f.key, title: f.title, index, total: deck.flaws.length, relapsed: f.relapsed, chip: f.chip, level: f.level,
    happening, quote: f.quote, why: f.why, drill: f.drillText, costPer: f.costPer, n: f.n, recent: f.recent,
    cmp: f.cmp ? { diff: f.cmp.diff, diffSd: f.cmp.diffSd, lo80: f.cmp.lo80, hi80: f.cmp.hi80, shrunk: f.cmp.shrunk, restShrunk: f.cmp.restShrunk } : null,
    where: f.where, timeline: f.timeline, chart: f.chart,
    examples: f.examples.filter((id) => deck.thumbs[id]).slice(0, 3).map((id) => ({ id, ...deck.thumbs[id] })),
    activeKey: deck.active?.work.flaw_key ?? null, activeTitle: deck.active?.title ?? null,
    claim: { n: f.n, lo: f.cmp?.lo80, hi: f.cmp?.hi80, ci: 80, level: f.level, unit: 'R' },
  };
}

for (let k = 1; k <= 5; k++) add({
  id: `flaw-${k}`, title: k === 1 ? 'Your worst flaw' : `Flaw #${k}`, category: 'flaw', kind: 'flaw', sizes: ['M', 'L'], defaultSize: 'L', claims: true, minTrades: 0,
  settings: {},
  help: 'One of the few things costing you most, ranked by how sure the engine is × what it costs each time × how often it happened in your last 20 trades. Its drill is yours to rewrite; "Work on this" makes it the one drill you track.',
  select: (v) => { const d = v.deck(); const f = d.flaws[k - 1]; return f ? flawVM(v, d, f, k - 1) : { kind: 'none' }; },
  attention: (v) => flawNews(v.deck().flaws[k - 1], v.settled.map((t) => t.id)),
});

add({
  id: 'active-drill', title: 'Active drill', category: 'flaw', kind: 'drill', sizes: ['S', 'M', 'L'], defaultSize: 'M', minTrades: 0,
  settings: {}, attention: (v) => drillMilestone(v.deck().active?.progress),
  help: 'The one drill you are working on: how often the flaw happened before and since, how often you kept the drill, and how close it is to graduating (20 clean trades in a row, drill kept on 90%).',
  select: (v) => {
    const a = v.deck().active;
    if (!a) return { kind: 'text', headline: 'No drill active', body: 'Pick one from a flaw card: "Work on this".', tone: 'neutral' };
    const p = a.progress;
    return { kind: 'drill', id: a.work.id, key: a.work.flaw_key, title: a.title, drill: a.work.drill_text, since: a.work.started_at.slice(0, 10),
      before: p.rateBefore, after: p.rateSince, baselineN: a.work.baseline_n ?? 0, sinceN: p.since, kept: p.kept, broken: p.broken, na: p.na, clean: p.clean,
      claim: { n: p.since } };
  },
});

add({
  id: 'fix-data', title: 'Fix your data', category: 'flaw', kind: 'rings', sizes: ['S', 'M'], defaultSize: 'S', minTrades: 1,
  settings: { scope: true },
  help: 'How many of your last 30 trades have each group of fields the engine reads. Under half, every flaw it finds is partly a guess.',
  select: (v) => {
    const recent = v.settled.slice(-30);
    const rings = DATA_GROUPS.map((g) => { const f = recent.filter((t) => fills(t, g.fields)).length; const share = recent.length ? f / recent.length : 0;
      return { label: g.label, share, sub: `${f} of ${recent.length}`, tone: (share >= 0.8 ? 'good' : share >= 0.5 ? 'watch' : 'bad') as Tone }; });
    const worst = [...rings].sort((a, b) => a.share - b.share)[0];
    return { kind: 'rings', rings, footer: 'Last 30 settled trades',
      action: worst && worst.share < 0.5 ? { label: 'Work on this', key: 'data', drill: `I fill in ${worst.label} on every trade this week.` } : undefined };
  },
});

add({
  id: 'lessons', title: 'Lessons not yet learned', category: 'flaw', kind: 'list', sizes: ['T', 'L'], defaultSize: 'T', minTrades: 0,
  settings: {},
  help: 'The same lesson written 3 or more times in your last 30 trades: you know it, and it keeps happening.',
  select: (v) => ({ kind: 'list', empty: 'No lesson repeated 3+ times in your last 30 trades.',
    rows: v.ledger.repeated.map((r) => ({ key: r.id, title: r.title, value: `${r.quotes.length}×`, tone: 'watch' as Tone,
      sub: r.quotes.length ? `“${r.quotes[r.quotes.length - 1].text}” — ${r.quotes[r.quotes.length - 1].date}` : undefined, chips: [r.rule] })) }),
});

/* ───────────────────────── lists ───────────────────────── */

add({
  id: 'losses', title: 'Every loss, with its lesson', category: 'list', kind: 'list', sizes: ['T', 'L'], defaultSize: 'T', minTrades: 0,
  settings: { scope: true },
  help: 'Every losing trade, newest first, with the rules it broke and the lesson you wrote.',
  select: (v) => ({ kind: 'list', empty: 'No losses in view.', summary: plural(v.ledger.losses.length, 'loss'),
    rows: [...v.ledger.losses].reverse().map((l): ListRow => ({ key: l.id, title: `${l.date} · ${l.label}`, value: R(l.r, 1), tone: 'bad', href: `/trade/${l.id}`,
      sub: l.lesson ?? undefined, chips: l.breaks.map((b) => b.short) })) }),
});

add({
  id: 'day-audit', title: 'Day by day', category: 'list', kind: 'list', sizes: ['T', 'L'], defaultSize: 'T', minTrades: 0,
  settings: { scope: true },
  help: 'Every real trading day with 2+ trades, in the order the day rules checked them, and what each rule said — so "no tilt rule broken" can be checked by eye. Backtests are never day-checked.',
  select: (v) => {
    const a = v.tilt.audit;
    return { kind: 'list', empty: 'No real trading day with 2+ trades yet.', summary: `${plural(a.daysChecked, 'day')} checked`,
      rows: [...a.days].reverse().map((d) => ({ key: d.key, title: d.label + (d.ordered === 'logged' ? ' · by log time' : ''),
        sub: d.trades.map((t) => `${t.time ?? '—'} ${R(t.r, 1)}`).join(' · '),
        chips: [...new Set(d.trades.flatMap((t) => t.rules))], tone: (d.trades.some((t) => t.rules.length) ? 'watch' : 'neutral') as Tone })) };
  },
});

add({
  id: 'missed', title: 'Missed setups', category: 'list', kind: 'list', sizes: ['T', 'L'], defaultSize: 'T', claims: true, minTrades: 0,
  settings: {},
  help: 'Setups you saw and skipped, logged in real time, by the reason you gave: how many would have won and the R left behind. Hindsight entries are left out and counted.',
  select: (v) => {
    const m = v.missed;
    return { kind: 'list', empty: `No real-time missed setups${m.hindsightLeftOut ? ` (${m.hindsightLeftOut} hindsight left out)` : ''}.`,
      summary: m.realtime ? `${m.realtime} skips · ${m.wouldWin} would have won · ${R(m.rLeft, 1)} left` : undefined, claim: { n: m.realtime },
      rows: m.byReason.map((r) => ({ key: r.reason, title: r.reason, value: `${r.wouldWin}/${r.n} won`, sub: `${R(r.rLeft, 1)} left`, tone: 'neutral' as Tone })) };
  },
});

add({
  id: 'similar', title: 'Similar setups', category: 'list', kind: 'custom', view: 'similar', sizes: ['L'], defaultSize: 'L', claims: true, minTrades: 8,
  settings: {},
  help: 'The nearest past trades to a setup, by distance over the fields known before the entry. A shrunk mean and a win chance: a guide, not a verdict.',
  select: (v) => ({ kind: 'custom', view: 'similar', claim: { n: v.similar?.n ?? 0 },
    data: { options: v.simOptions, picked: v.simTarget?.id ?? null, result: v.similar, thumbs: v.thumbsOf(v.similar?.neighbours.map((x) => x.id) ?? []) } }),
});

add({
  id: 'language', title: 'Journal language', category: 'list', kind: 'list', sizes: ['T', 'L'], defaultSize: 'T', claims: true, minTrades: 8,
  settings: {},
  help: 'Phrases from text written after the outcome, outcome words removed, shrunk and corrected. They describe how you talk about trades; they can never say what wins.',
  select: (v) => ({ kind: 'list', empty: 'No phrase used often enough yet.', summary: `Diagnostic, not predictive · ${plural(v.lang.phrases.length, 'phrase')}`,
    rows: v.lang.phrases.map((p) => ({ key: p.text, title: `“${p.text}”`, value: p.cmp ? R(p.cmp.diff) : `${p.n}×`,
      sub: `${p.n}× · ${p.cmp ? VERDICT_LABEL[p.cmp.verdict.level] : 'Too early'}`, tone: (p.cmp && p.cmp.diff < 0 ? 'bad' : 'neutral') as Tone })) }),
});
