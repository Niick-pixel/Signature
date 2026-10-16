/**
 * Red days: a market day whose taken trades net below zero.
 *
 * Two worlds, never mixed: real accounts (Demo, Live, Eval, Funded) by the
 * day the trade was taken, and backtests by the replayed session (chart
 * date). Missed trades did not happen and are never part of a day's result.
 */
import { countsInStats, isBacktest, isHypothetical, isTaken, marketDay } from './domain';
import type { Trade } from './types';

export type World = 'real' | 'backtest';

export interface RedDay {
  day: string;
  world: World;
  netR: number;
  trades: number;
  /** When the day's last trade was logged — the prompt waits until after it. */
  lastLoggedAt: string;
}

export function redDays(trades: readonly Trade[]): RedDay[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    if (t.deleted_at || isHypothetical(t.account) || !isTaken(t.outcome) || t.status === 'Planned' || !countsInStats(t)) continue;
    const day = marketDay(t);
    if (!day) continue;
    const key = `${isBacktest(t.account) ? 'backtest' : 'real'}|${day}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: RedDay[] = [];
  for (const [key, ts] of groups) {
    const netR = Math.round(ts.reduce((s, t) => s + (t.r_multiple ?? 0), 0) * 100) / 100;
    if (netR >= 0) continue;
    const [world, day] = key.split('|') as [World, string];
    out.push({ day, world, netR, trades: ts.length, lastLoggedAt: ts.map((t) => t.created_at).sort().pop()! });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

/** The page template for a red day. */
export function redDayTemplate(d: RedDay, lines: string[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    `<p><b>${d.world === 'backtest' ? 'Backtest session' : 'Red day'}: ${d.netR}R over ${d.trades} trade${d.trades === 1 ? '' : 's'}.</b></p>`,
    lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '',
    '<h2>What I saw</h2><p></p>',
    '<h2>What I did</h2><p></p>',
    '<h2>Rule broken or followed</h2><p></p>',
    '<h2>One if-then rule for next time</h2><p>If … then …</p>',
  ].join('');
}
