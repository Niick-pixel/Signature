/**
 * The Dashboard's numbers: where I stand at a glance. Pure — the page passes
 * the trades (Hindsight already out) and one number the review engine knows
 * (how many recent trades kept every rule).
 */
import { resultClass } from './edge/metrics';
import { isBacktest, isHypothetical, isTaken } from './domain';
import { pnlOf } from './stats';
import type { Trade } from './types';

export type DashWorld = 'real' | 'backtest' | 'all';

/** Which trades the dashboard counts: real accounts, backtests, or both. Missed never. */
export function inWorld(t: Trade, world: DashWorld): boolean {
  if (t.deleted_at || isHypothetical(t.account) || !isTaken(t.outcome) || t.status === 'Planned') return false;
  return world === 'all' || (world === 'backtest') === isBacktest(t.account);
}

/** One account as the filter knows it: the account, or the account and its label ("Eval|Apex-1"). */
export const accountKey = (t: Pick<Trade, 'account' | 'account_label'>) => (t.account_label?.trim() ? `${t.account}|${t.account_label.trim()}` : t.account);
export const accountKeyLabel = (key: string) => { const [a, l] = key.split('|'); return l ? `${l} (${a.replace(' (FX Replay)', '')})` : a.replace(' (FX Replay)', ''); };

/** In the chosen accounts: an account key matches itself; a bare account matches every label on it. */
export function inAccounts(t: Trade, keys: ReadonlySet<string>): boolean {
  return inWorld(t, 'all') && (keys.has(accountKey(t)) || keys.has(t.account));
}

/** The day a trade counts on: its date, or for an undated backtest the day it was logged. */
export const dayOf = (t: Trade): string => (t.undated
  ? new Date(t.created_at.endsWith('Z') ? t.created_at : `${t.created_at}Z`).toLocaleDateString('en-CA')
  : t.date.slice(0, 10));

const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

export interface Totals { trades: number; wins: number; losses: number; money: number | null; r: number }

export function totals(ts: readonly Trade[]): Totals {
  const priced = ts.map(pnlOf).filter((v): v is number => v != null);
  return {
    trades: ts.length,
    wins: ts.filter((t) => classOf(t) === 'W').length,
    losses: ts.filter((t) => classOf(t) === 'L').length,
    money: priced.length ? round(priced.reduce((s, v) => s + v, 0)) : null,
    r: round(ts.reduce((s, t) => s + (t.r_multiple ?? 0), 0)),
  };
}

/** W / L / BE from R where recorded (lib/edge/metrics), from the label only where it never was. */
const classOf = (t: Trade) => (t.r_multiple != null ? resultClass(t.r_multiple) : t.outcome === 'Win' ? 'W' : t.outcome === 'Loss' ? 'L' : 'BE');

export interface TileValues { winRate: number | null; avgWinR: number | null; profitFactor: number | null; avgWin: number | null; avgLoss: number | null }

export function tileValues(ts: readonly Trade[]): TileValues {
  // Canonical classes (lib/edge/metrics): averages over wins only and losses only; PF over every positive and negative R.
  const wins = ts.filter((t) => classOf(t) === 'W'); const losses = ts.filter((t) => classOf(t) === 'L');
  const winsR = wins.map((t) => t.r_multiple as number);
  const winsM = wins.map(pnlOf).filter((v): v is number => v != null);
  const lossM = losses.map(pnlOf).filter((v): v is number => v != null).map(Math.abs);
  const sumW = ts.filter((t) => (t.r_multiple ?? 0) > 0).reduce((s, t) => s + (t.r_multiple as number), 0);
  const sumL = Math.abs(ts.filter((t) => (t.r_multiple ?? 0) < 0).reduce((s, t) => s + (t.r_multiple as number), 0));
  const r = (v: number | null) => (v == null ? null : round(v));
  return {
    winRate: wins.length + losses.length ? round(wins.length / (wins.length + losses.length), 3) : null,
    avgWinR: r(mean(winsR)),
    profitFactor: sumL > 0 ? round(sumW / sumL) : null,
    avgWin: r(mean(winsM)),
    avgLoss: r(mean(lossM)),
  };
}

export interface ScoreAxes { rules: number | null; honesty: number | null; consistency: number | null; profitFactor: number | null; avgR: number | null; winRate: number | null }
export const SCORE_AXES: Array<{ key: keyof ScoreAxes; label: string; hint: string }> = [
  { key: 'rules', label: 'Rules kept', hint: 'Of your last 20 trades, the share that broke none of your written rules.' },
  { key: 'honesty', label: 'Honesty', hint: 'The share graded before the outcome was known (Lock grade, or logged Planned or Live).' },
  { key: 'consistency', label: 'Consistency', hint: 'The share of trading days that did not end red.' },
  { key: 'profitFactor', label: 'Profit factor', hint: 'R won over R lost; 2.0 or more scores 100.' },
  { key: 'avgR', label: 'Avg R', hint: 'Average R per trade; 0R scores 50, +1R or more scores 100.' },
  { key: 'winRate', label: 'Win rate', hint: 'Wins over wins and losses.' },
];

export function scoreAxes(ts: readonly Trade[], rulesKeptShare: number | null): ScoreAxes {
  const v = tileValues(ts);
  const days = new Map<string, number>();
  for (const t of ts) days.set(dayOf(t), (days.get(dayOf(t)) ?? 0) + (t.r_multiple ?? 0));
  const clamp = (x: number) => Math.round(Math.max(0, Math.min(100, x)));
  const avg = mean(ts.filter((t) => t.r_multiple != null).map((t) => t.r_multiple as number));
  return {
    rules: rulesKeptShare == null ? null : clamp(rulesKeptShare * 100),
    honesty: ts.length ? clamp((ts.filter((t) => !t.graded_post_hoc).length / ts.length) * 100) : null,
    consistency: days.size ? clamp(([...days.values()].filter((r) => r >= 0).length / days.size) * 100) : null,
    profitFactor: v.profitFactor == null ? null : clamp((v.profitFactor / 2) * 100),
    avgR: avg == null ? null : clamp(50 + avg * 50),
    winRate: v.winRate == null ? null : clamp(v.winRate * 100),
  };
}

/** The overall score: the average of the axes that are on and measurable. */
export function overallScore(axes: ScoreAxes, enabled: Partial<Record<keyof ScoreAxes, boolean>> = {}): number | null {
  const vals = SCORE_AXES.filter((a) => enabled[a.key] !== false).map((a) => axes[a.key]).filter((x): x is number => x != null);
  return vals.length ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : null;
}

export interface DashboardData {
  world: DashWorld;
  total: Totals;
  /** The last 7 days, and the 7 before (for the change line). */
  week7: Totals;
  /** The tiles now (last 30 days) and the 30 days before, for the arrows; plus all time. */
  tiles: { all: TileValues; last30: TileValues; prev30: TileValues };
  /** Cumulative, in the order traded: money when priced, R always. */
  curve: Array<{ day: string; r: number; money: number | null }>;
  /** This week, Monday to Sunday: net per day. */
  week: Array<{ day: string; r: number; money: number | null; trades: number }>;
  axes: ScoreAxes;
  recent: Array<{ id: string; day: string; account: string; setup: string; direction: string; outcome: string; r: number | null; money: number | null }>;
}

export function dashboardData(trades: readonly Trade[], world: DashWorld, today: string, rulesKeptShare: number | null, accounts?: ReadonlySet<string>): DashboardData {
  const ts = trades.filter((t) => (accounts?.size ? inAccounts(t, accounts) : inWorld(t, world))).sort((a, b) => a.date.localeCompare(b.date));
  const since = (n: number) => addDays(today, -n + 1);
  const between = (from: string, to: string) => ts.filter((t) => { const d = dayOf(t); return d >= from && d <= to; });
  let cr = 0; let cm = 0; let priced = false;
  const curve = ts.map((t) => {
    cr += t.r_multiple ?? 0;
    const m = pnlOf(t); if (m != null) { cm += m; priced = true; }
    return { day: dayOf(t), r: round(cr), money: priced ? round(cm) : null };
  });
  const monday = (() => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const dayTs = ts.filter((t) => dayOf(t) === day);
    return { day, trades: dayTs.length, r: round(dayTs.reduce((s, t) => s + (t.r_multiple ?? 0), 0)), money: totals(dayTs).money };
  });
  return {
    world,
    total: totals(ts),
    week7: totals(between(since(7), today)),
    tiles: { all: tileValues(ts), last30: tileValues(between(since(30), today)), prev30: tileValues(between(since(60), since(31))) },
    curve, week,
    axes: scoreAxes(ts, rulesKeptShare),
    recent: [...ts].reverse().slice(0, 8).map((t) => ({
      id: t.id, day: dayOf(t), account: t.account, setup: t.setup_type, direction: t.direction, outcome: t.outcome, r: t.r_multiple, money: pnlOf(t),
    })),
  };
}
