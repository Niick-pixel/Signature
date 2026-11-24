/**
 * Live nudges (the cockpit): what today's own trades and rules say right now. Pure.
 *
 * A journal, not a gatekeeper: a nudge is a sentence, never a block, and never a call to trade —
 * it only ever points at a rule you wrote (stop after N losses, the trades you planned, Scenario C's
 * cutoff, no position through a red folder) or a pattern in your own day (a re-entry right after a
 * loss, size up after a loss). Nothing here is ever coloured as good.
 */
export type NudgeLevel = 'stop' | 'warn' | 'note';
export interface Nudge { key: string; kind: string; level: NudgeLevel; text: string }

export interface NudgeTrade {
  id: string;
  /** Local wall time, YYYY-MM-DDTHH:MM. */
  date: string;
  outcome: string;
  r_multiple: number | null;
  contracts: number | null;
  /** When its loss was known (local wall time), for a loss. */
  lossAt: string | null;
}
export interface NudgeInput {
  /** Now, local wall time and New York minutes past midnight. */
  nowLocal: string;
  nowNy: number;
  /** Today's taken trades on real accounts, in the order they happened. */
  trades: readonly NudgeTrade[];
  /** The day's stop after N losses (the prep's, or the setting). */
  stopAfter: number;
  /** The trades planned in the morning check-in. */
  maxTrades: number | null;
  /** Scenario C's cutoff, New York minutes. */
  cutoffNy: number | null;
  /** Today's red and orange releases, New York minutes. */
  news: ReadonlyArray<{ ny: number; title: string; impact: string }>;
}

/** A re-entry within this many minutes of a loss is a reaction until shown otherwise. */
export const REENTRY_MIN = 15;
/** A release this close (before or after) is "through it". */
const NEWS_BEFORE = 10; const NEWS_AFTER = 15;
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);

export function nudges(x: NudgeInput): Nudge[] {
  const out: Nudge[] = [];
  const losses = x.trades.filter((t) => t.outcome === 'Loss');
  const taken = x.trades.length;
  // The day's stop: reached, or one loss away.
  if (x.stopAfter > 0 && losses.length >= x.stopAfter) {
    out.push({ key: 'stop-losses', kind: 'stop-losses', level: 'stop', text: `${losses.length} losses today — your rule is to stop after ${x.stopAfter}. The day is done.` });
  } else if (x.stopAfter > 1 && losses.length === x.stopAfter - 1) {
    out.push({ key: 'last-loss', kind: 'last-loss', level: 'warn', text: `One more loss ends the day (stop after ${x.stopAfter}).` });
  }
  if (x.maxTrades != null && x.maxTrades > 0 && taken >= x.maxTrades) {
    out.push({ key: 'max-trades', kind: 'max-trades', level: 'stop', text: `${taken} of the ${x.maxTrades} trade${x.maxTrades === 1 ? '' : 's'} you planned this morning — that was the plan.` });
  }
  // A re-entry right after a loss: the last trade a loss, known moments ago.
  const last = x.trades[x.trades.length - 1];
  if (last?.outcome === 'Loss' && last.lossAt) {
    const since = minutesBetween(last.lossAt, x.nowLocal);
    if (since >= 0 && since < REENTRY_MIN) {
      out.push({ key: `reentry:${last.id}`, kind: 'reentry', level: 'warn', text: `${since} min since a loss. The next trade has to be one of the plans, not a reaction — ${REENTRY_MIN - since} min to cool off.` });
    }
  }
  // Size up after a loss, today.
  for (let i = 1; i < x.trades.length; i++) {
    const prev = x.trades[i - 1]; const t = x.trades[i];
    if (prev.outcome === 'Loss' && prev.contracts != null && t.contracts != null && t.contracts > prev.contracts) {
      out.push({ key: `size-up:${t.id}`, kind: 'size-up', level: 'warn', text: `Size went up after a loss (${prev.contracts} → ${t.contracts} contracts).` });
    }
  }
  // Scenario C's cutoff passed: no trade from here.
  if (x.cutoffNy != null && x.nowNy >= x.cutoffNy && x.nowNy < 16 * 60) {
    out.push({ key: 'cutoff', kind: 'cutoff', level: 'note', text: `Past your ${hhmm(x.cutoffNy)} cutoff — Scenario C: no trade.` });
  }
  // A red folder close: no position through it.
  for (const n of x.news) {
    const d = n.ny - x.nowNy;
    if (d <= NEWS_BEFORE && d >= -NEWS_AFTER) {
      out.push({ key: `news:${n.ny}:${n.title}`, kind: 'news', level: n.impact === 'High' ? 'warn' : 'note',
        text: d > 0 ? `${n.title} in ${d} min — no position through it.` : `${n.title} ${-d === 0 ? 'now' : `${-d} min ago`} — trade off the release candle's range, not into it.` });
    }
  }
  const order: Record<NudgeLevel, number> = { stop: 0, warn: 1, note: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** The next moment worth counting down to: the killzone opening or closing, the cutoff, the next release. */
export function countdowns(nowNy: number, cutoffNy: number | null, news: NudgeInput['news'], killzone = { from: 9 * 60 + 30, to: 12 * 60 }): Array<{ key: string; label: string; inMin: number }> {
  const out: Array<{ key: string; label: string; inMin: number }> = [];
  if (nowNy < killzone.from) out.push({ key: 'kz-open', label: 'NY AM killzone opens', inMin: killzone.from - nowNy });
  else if (nowNy < killzone.to) out.push({ key: 'kz-close', label: 'NY AM killzone ends', inMin: killzone.to - nowNy });
  if (cutoffNy != null && nowNy < cutoffNy) out.push({ key: 'cutoff', label: `Cutoff ${hhmm(cutoffNy)} (Scenario C)`, inMin: cutoffNy - nowNy });
  const next = news.filter((n) => n.ny > nowNy).sort((a, b) => a.ny - b.ny)[0];
  if (next) out.push({ key: 'news', label: next.title, inMin: next.ny - nowNy });
  return out;
}
