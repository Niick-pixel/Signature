/**
 * The week, pre-written: what a weekly review page starts with, so it is
 * edited rather than started blank. Pure — the numbers, the patterns found
 * in the week's writing, the rules broken, the best and worst trade, and the
 * lessons that came back.
 */
import { isBacktest, isHypothetical, isTaken } from './domain';
import { THEMES, analyse, themesOf } from './insights';
import { brokenFor, dayBreaksByTrade, fieldEras, LEAK_RULES, loggedDay, trends } from './review';
import { RULES, type DayContext, type RuleConfig, DEFAULT_RULE_CONFIG } from './ruleBook';
import type { Trade } from './types';

export interface WorldWeek { n: number; wins: number; losses: number; netR: number }
export interface TradeLine { id: string; date: string; account: string; setup: string; direction: string; target: string; r: number; lesson: string | null; screenshot: string | null }

export interface WeekReview {
  monday: string;
  sunday: string;
  real: WorldWeek;
  backtest: WorldWeek;
  patterns: Array<{ id: string; title: string; n: number; netR: number }>;
  broken: Array<{ short: string; count: number }>;
  best: TradeLine | null;
  worst: TradeLine | null;
  /** Lessons written this week whose pattern came back within 5 trades. */
  repeats: Array<{ title: string; lessonDate: string; repeatDate: string }>;
  /** Next week's suggested focus: the rule behind the #1 leak, and the leak's if-then. */
  next: { ruleId: string | null; ruleText: string | null; ifThen: string | null };
}

const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const round = (v: number) => Math.round(v * 100) / 100;

export function weekReview(trades: readonly Trade[], monday: string, ctxFor: (day: string) => DayContext = () => ({}),
  cfg: RuleConfig = DEFAULT_RULE_CONFIG, tz?: string): WeekReview {
  const sunday = addDays(monday, 6);
  const taken = trades.filter((t) => !t.deleted_at && !isHypothetical(t.account) && isTaken(t.outcome) && t.status !== 'Planned');
  const week = taken.filter((t) => { const d = loggedDay(t, tz); return d >= monday && d <= sunday; });
  const world = (ts: Trade[]): WorldWeek => ({
    n: ts.length, wins: ts.filter((t) => t.outcome === 'Win').length, losses: ts.filter((t) => t.outcome === 'Loss').length,
    netR: round(ts.reduce((s, t) => s + (t.r_multiple ?? 0), 0)),
  });

  const pat = new Map<string, { n: number; netR: number }>();
  for (const t of week) for (const id of themesOf(t)) {
    const cur = pat.get(id) ?? { n: 0, netR: 0 };
    pat.set(id, { n: cur.n + 1, netR: round(cur.netR + (t.r_multiple ?? 0)) });
  }
  const patterns = [...pat].map(([id, v]) => ({ id, title: THEMES.find((d) => d.id === id)?.title ?? id, ...v }))
    .sort((a, b) => a.netR - b.netR || b.n - a.n);

  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  const eras = fieldEras(trades);
  const counts = new Map<string, number>();
  for (const t of week) for (const b of brokenFor(t, breaks, cfg, eras)) counts.set(b.short, (counts.get(b.short) ?? 0) + 1);

  const line = (t: Trade | undefined): TradeLine | null => (t ? {
    id: t.id, date: t.date.slice(0, 10), account: t.account, setup: t.setup_type, direction: t.direction, target: t.target_type,
    r: t.r_multiple ?? 0, lesson: t.lesson, screenshot: t.screenshot_path,
  } : null);
  const byR = [...week].filter((t) => t.r_multiple != null).sort((a, b) => (b.r_multiple as number) - (a.r_multiple as number));

  const ids = new Set(week.map((t) => t.id));
  const repeats = trends(trades, ctxFor, cfg).repeats.filter((r) => ids.has(r.lessonTradeId) || ids.has(r.repeatTradeId))
    .map((r) => ({ title: r.title, lessonDate: r.lessonDate, repeatDate: r.repeatDate }));

  const ins = analyse(trades);
  const ruleId = ins.focus ? LEAK_RULES[ins.focus.id] ?? null : null;
  return {
    monday, sunday,
    real: world(week.filter((t) => !isBacktest(t.account))),
    backtest: world(week.filter((t) => isBacktest(t.account))),
    patterns, broken: [...counts].sort((a, b) => b[1] - a[1]).map(([short, count]) => ({ short, count })),
    best: byR.length && (byR[0].r_multiple as number) > 0 ? line(byR[0]) : null,
    worst: byR.length && (byR[byR.length - 1].r_multiple as number) < 0 ? line(byR[byR.length - 1]) : null,
    repeats,
    next: { ruleId, ruleText: ruleId ? RULES.find((r) => r.id === ruleId)?.text ?? null : null, ifThen: ins.focus?.rule ?? null },
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
const worldLine = (label: string, w: WorldWeek) => (w.n ? `<li>${label}: ${w.n} trade${w.n === 1 ? '' : 's'}, ${w.wins}W / ${w.losses}L, <b>${signed(w.netR)}</b></li>` : '');

function tradeBlock(label: string, t: TradeLine): string {
  return [
    `<p><b>${label}:</b> ${esc(t.date)} · ${esc(t.account)} · ${esc(t.setup)} ${esc(t.direction)} · target ${esc(t.target)} · <b>${signed(t.r)}</b></p>`,
    t.screenshot ? `<p><img src="/api/screenshots/${encodeURIComponent(t.screenshot)}?w=720" alt="${label} chart"></p>` : '',
    t.lesson ? `<blockquote>${esc(t.lesson)}</blockquote>` : '',
  ].join('');
}

/** The pre-written part of the page, as journal HTML (it goes through the journal's sanitiser). */
export function weekReviewHtml(w: WeekReview): string {
  const none = (s: string) => `<p><i>${s}</i></p>`;
  return [
    `<h2>The week in numbers</h2>`,
    w.real.n + w.backtest.n ? `<ul>${worldLine('Real', w.real)}${worldLine('Backtest', w.backtest)}</ul>` : none('No trades logged this week.'),
    `<h2>Patterns in my writing</h2>`,
    w.patterns.length ? `<ul>${w.patterns.slice(0, 5).map((p) => `<li>${esc(p.title)} — ${p.n} trade${p.n === 1 ? '' : 's'}, ${signed(p.netR)}</li>`).join('')}</ul>` : none('None found this week.'),
    `<h2>Rules broken</h2>`,
    w.broken.length ? `<ul>${w.broken.map((b) => `<li>${esc(b.short)}${b.count > 1 ? ` ×${b.count}` : ''}</li>`).join('')}</ul>` : none('Every rule the record can check was kept.'),
    `<h2>Best and worst trade</h2>`,
    w.best ? tradeBlock('Best', w.best) : none('No winner this week.'),
    w.worst ? tradeBlock('Worst', w.worst) : none('No loser this week.'),
    w.repeats.length ? `<h2>Lessons that came back</h2><ul>${w.repeats.map((r) => `<li>${esc(r.title)}: written ${esc(r.lessonDate)}, back ${esc(r.repeatDate)}</li>`).join('')}</ul>` : '',
  ].join('');
}
