/**
 * The tilt index: mean R by the state a trade was taken in — losses in a row
 * before it (0, 1, 2+) against which trade of the day it was (1st, 2nd, 3rd+)
 * — every cell shrunk toward your overall mean, so a cell of three trades
 * cannot shout. And the days (or replay sessions) where the computer caught a
 * tilt rule breaking: more than 2 trades, a trade after 2 losses in a row, a
 * re-entry inside the cooldown.
 */
import { shrinkGroups } from './shrink';
import { Z80 } from './dist';
import { resultClass } from './metrics';
import type { TradeState } from './state';
import type { Trade } from '../types';
import { isBacktest } from '../domain';

export const TILT_RULES = ['max-trades', 'stop-after-losses', 'cooldown'] as const;

export interface TiltCell { losses: '0' | '1' | '2+'; tradeNo: '1st' | '2nd' | '3rd+'; n: number; shrunk: number; lo80: number; hi80: number; rawMean: number | null }
export interface TiltSequence { key: string; label: string; trades: Array<{ id: string; date: string; r: number | null; rules: Array<{ id: string; short: string; source: 'auto' | 'self' }> }>; netR: number }
/**
 * The audit behind "no tilt rule broken": every real trading day the day
 * rules ran on, its trades in the order they were checked, and what each
 * rule said — so the claim can be checked by eye. Trades a day rule cannot
 * see (backtests, undated) are counted, and a day whose order came from when
 * you logged the trades rather than from entry times is marked.
 */
export interface AuditDay {
  key: string; label: string;
  /** 'time': every trade carried an entry time; 'logged': at least one did not, so the order is the logging order. */
  ordered: 'time' | 'logged';
  trades: Array<{ id: string; time: string | null; r: number | null; rules: string[] }>;
  verdicts: Array<{ id: string; short: string; broken: number }>;
}
export interface TiltAudit { days: AuditDay[]; daysChecked: number; singleTradeDays: number; notDayChecked: { backtest: number; other: number }; orderUncertain: number }
export interface TiltIndex { cells: TiltCell[]; mu: number; k: number; sequences: TiltSequence[]; audit: TiltAudit }

// One formatter, built once: toLocaleDateString builds a new one on every call.
const DAY_LABEL = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const L = (n: number): TiltCell['losses'] => (n >= 2 ? '2+' : n === 1 ? '1' : '0');
const N = (n: number): TiltCell['tradeNo'] => (n >= 3 ? '3rd+' : n === 2 ? '2nd' : '1st');

export function tiltIndex(trades: readonly Trade[], states: Map<string, TradeState>,
  breaks: (t: Trade) => Array<{ id: string; short: string; source?: 'auto' | 'self' }>): TiltIndex {
  const withR = trades.filter((t) => t.r_multiple != null && states.get(t.id)?.tradeNo != null);
  const keys: Array<[TiltCell['losses'], TiltCell['tradeNo']]> = [];
  for (const l of ['0', '1', '2+'] as const) for (const n of ['1st', '2nd', '3rd+'] as const) keys.push([l, n]);
  const groups = keys.map(([l, n]) => {
    const ts = withR.filter((t) => { const s = states.get(t.id)!; return L(s.lossesInRowBefore!) === l && N(s.tradeNo!) === n; });
    return { key: `${l}|${n}`, x: ts.map((t) => t.r_multiple as number), w: ts.map(() => 1),
      wins: ts.filter((t) => resultClass(t.r_multiple as number) === 'W').length, losses: ts.filter((t) => resultClass(t.r_multiple as number) === 'L').length };
  });
  const sh = shrinkGroups(groups.filter((g) => g.x.length > 0));
  const cells = keys.map(([l, n]) => {
    const g = sh.groups.find((x) => x.key === `${l}|${n}`);
    return g ? { losses: l, tradeNo: n, n: g.n, shrunk: g.shrunk, lo80: g.shrunk - Z80 * g.sd, hi80: g.shrunk + Z80 * g.sd, rawMean: g.rawMean }
      : { losses: l, tradeNo: n, n: 0, shrunk: sh.mu, lo80: sh.mu, hi80: sh.mu, rawMean: null };
  });

  const byKey = new Map<string, Trade[]>();
  for (const t of trades) { const k = states.get(t.id)?.key; if (k) byKey.set(k, [...(byKey.get(k) ?? []), t]); }
  const sequences: TiltSequence[] = [];
  for (const [key, ts] of byKey) {
    const flagged = ts.map((t) => ({ t, rules: breaks(t).filter((b) => (TILT_RULES as readonly string[]).includes(b.id)) }));
    if (!flagged.some((x) => x.rules.length)) continue;
    const sorted = [...flagged].sort((a, b) => (states.get(a.t.id)!.tradeNo ?? 0) - (states.get(b.t.id)!.tradeNo ?? 0));
    sequences.push({
      key, label: key.startsWith('session:') ? `Replay session ${key.slice(8)}` : DAY_LABEL.format(new Date(`${key}T12:00:00Z`)),
      trades: sorted.map(({ t, rules }) => ({ id: t.id, date: t.date, r: t.r_multiple, rules: rules.map((b) => ({ id: b.id, short: b.short, source: b.source ?? 'auto' })) })),
      netR: Math.round(ts.reduce((a, t) => a + (t.r_multiple ?? 0), 0) * 100) / 100,
    });
  }
  sequences.sort((a, b) => (b.trades[0]?.date ?? '').localeCompare(a.trades[0]?.date ?? ''));
  return { cells, mu: sh.mu, k: sh.k, sequences, audit: tiltAudit(trades, states, breaks, byKey) };
}

const TILT_SHORT: Record<(typeof TILT_RULES)[number], string> = { 'max-trades': 'At most 2 trades', 'stop-after-losses': 'Done after 2 losses in a row', cooldown: '10 minutes after a loss' };
const timeOf = (t: Trade) => (/T\d{2}:\d{2}/.test(t.date) ? t.date.slice(11, 16) : null);

export function tiltAudit(trades: readonly Trade[], states: Map<string, TradeState>,
  breaks: (t: Trade) => Array<{ id: string; short: string; source?: 'auto' | 'self' }>, byKey?: Map<string, Trade[]>): TiltAudit {
  const groups = byKey ?? (() => { const m = new Map<string, Trade[]>(); for (const t of trades) { const k = states.get(t.id)?.key; if (k) m.set(k, [...(m.get(k) ?? []), t]); } return m; })();
  const unkeyed = trades.filter((t) => !states.get(t.id)?.key);
  const days: AuditDay[] = [];
  let single = 0;
  for (const [key, ts] of groups) {
    if (key.startsWith('session:')) continue;
    if (ts.length < 2) { single += 1; continue; }
    const sorted = [...ts].sort((a, b) => (states.get(a.id)!.tradeNo ?? 0) - (states.get(b.id)!.tradeNo ?? 0));
    const times = sorted.map(timeOf);
    const rows = sorted.map((t, i) => ({ id: t.id, time: times[i], r: t.r_multiple, rules: breaks(t).filter((b) => (TILT_RULES as readonly string[]).includes(b.id)).map((b) => b.id) }));
    days.push({
      key, label: DAY_LABEL.format(new Date(`${key}T12:00:00Z`)),
      ordered: times.every((x) => x != null) && new Set(times).size === times.length ? 'time' : 'logged',
      trades: rows,
      verdicts: TILT_RULES.map((id) => ({ id, short: TILT_SHORT[id], broken: rows.filter((r) => r.rules.includes(id)).length })),
    });
  }
  days.sort((a, b) => b.key.localeCompare(a.key));
  return {
    days, daysChecked: days.length + single, singleTradeDays: single,
    notDayChecked: { backtest: unkeyed.filter((t) => isBacktest(t.account)).length, other: unkeyed.filter((t) => !isBacktest(t.account)).length },
    orderUncertain: days.filter((d) => d.ordered === 'logged').length,
  };
}
