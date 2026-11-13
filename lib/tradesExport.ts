import { groupRows, table, tradeSection } from './monthly';
import { replayDayLines, type ReplayDay } from './replay';
import { aggregate, pnlOf } from './stats';
import { isHypothetical } from './domain';
import { RUBRIC_V2_EXPLAINER } from './decision';
import type { Trade, TradeShot } from './types';

/**
 * The Trades tab, written to be discussed with Claude: exactly the trades the
 * list shows (its filters and search applied), oldest first, each written the
 * way the monthly review writes it, plus the numbers and what to look for.
 * A download: nothing leaves the machine by itself.
 */

export interface TradesExportInput {
  trades: Trade[];
  shots: Map<string, TradeShot[]>;
  /** What the list was showing, in words ("Demo · Losses · search “fvg”"). */
  view?: string;
  now?: Date;
  /** Replay days (048): backtests traded on one are grouped under it, with its plan. */
  replayDays?: ReplayDay[];
}

const r1 = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;
const r2 = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}R`;
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;

export function tradesExport(input: TradesExportInput) {
  const now = input.now ?? new Date();
  const trades = [...input.trades].sort((a, b) => a.date.localeCompare(b.date));
  const real = trades.filter((t) => !isHypothetical(t.account));
  const a = aggregate(real);
  const pnl = real.reduce((s, t) => s + (pnlOf(t) ?? 0), 0);
  const first = trades[0]?.date.slice(0, 10);
  const last = trades[trades.length - 1]?.date.slice(0, 10);
  const charts: Array<{ name: string; source: string }> = [];

  const out: string[] = [];
  const h = (s: string) => out.push('', s, '');
  const p = (s: string) => out.push(s);

  p(`# Trades${first ? ` — ${first === last ? first : `${first} to ${last}`}` : ''}`);
  p('');
  p(`_Exported ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC from Signature, a local trade journal kept by one trader. ${trades.length} trade${trades.length === 1 ? '' : 's'}${input.view ? `, as the Trades list showed them: ${input.view}` : ''}._`);

  h('## For Claude: what this is and what I want');
  p('These are my own trades, each with what I wrote at the time, how I graded it and what I tagged. I want an honest read, not encouragement:');
  p('');
  p('1. What do the winners have in common that the losers lack — in the setup, the checklist, the timing, or the writing?');
  p('2. Where do my words and my results disagree (I call a trade A+ and it loses, or say I followed the rules and the flags say otherwise)?');
  p('3. Which mistake costs me the most R here, and what single rule would have prevented most of it?');
  p('4. Anything that looks like tilt, revenge or forcing — trades bunched after a loss, size changes, quick logs.');
  p('');
  p(`Grades: ${RUBRIC_V2_EXPLAINER} Each trade names its rubric.`);
  p('');
  p("Small samples are small: say how sure you are, and don't treat a handful of trades as proof. Ask me about anything unclear before concluding. Charts, when attached, are named after the trade's `T-` reference.");

  h('## The numbers');
  if (a.taken) {
    p(table(['Trades taken', 'Win rate', 'Total', 'Average', 'P&L'], [[a.taken, pct(a.winRate), r1(a.totalR), a.avgR == null ? "—" : r2(a.avgR), usd(pnl)]]));
    const bySetup = groupRows(real, (t) => t.setup_type);
    if (bySetup.length > 1) { h('### By setup'); p(table(['Setup', 'Taken', 'Win rate', 'Total', 'Average'], bySetup)); }
    const bySession = groupRows(real, (t) => t.session);
    if (bySession.length > 1) { h('### By session'); p(table(['Session', 'Taken', 'Win rate', 'Total', 'Average'], bySession)); }
  } else p('_No taken trades in this view._');

  h('## Every trade');
  p('Oldest first. Missed trades are marked; their R is what they would have made.');
  // Backtests on a replay day are grouped under it, with the plan they were traded against; the rest follow.
  const days = new Map((input.replayDays ?? []).map((d) => [d.id, d] as const));
  const onDay = (id: string) => trades.filter((t) => t.replay_day_id === id);
  const grouped = [...days.values()].filter((d) => onDay(d.id).length).sort((a, b) => a.replay_date.localeCompare(b.replay_date) || a.sequence - b.sequence);
  for (const d of grouped) {
    const { heading, lines } = replayDayLines(d);
    h(`### ${heading}`);
    p(lines.join('\n'));
    for (const t of onDay(d.id)) out.push(...tradeSection(t, input.shots, charts));
  }
  const rest = trades.filter((t) => !t.replay_day_id || !days.has(t.replay_day_id));
  if (grouped.length && rest.length) h('### Not on a replay day');
  for (const t of rest) out.push(...tradeSection(t, input.shots, charts));
  if (!trades.length) p('_No trades in this view._');

  const stamp = now.toISOString().slice(0, 10);
  return { filename: `signature-trades-${stamp}`, markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n', charts };
}
