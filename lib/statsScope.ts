import {
  ACCOUNT_VALUES, DIRECTIONS, SESSIONS, isDated, isReal, marketDay,
  type Account, type Direction, type Session,
} from './domain';
import { localDay } from './day';
import type { Trade } from './types';

/**
 * What the Stats page is looking at: which accounts, which period, which
 * sessions and directions. Read from the URL (so a view can be linked and the
 * back button works) and applied before any figure is computed.
 *
 * "All accounts" means every account — Backtest and Missed included. It used
 * to mean real accounts only; asked for, it now means what it says, and the
 * page says so when a selection mixes real trades with replays or missed
 * setups, so a mixed total is never read as a live result.
 */
export const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'year', label: 'This year' },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];

export interface StatsScope {
  /** The accounts in view, in the order the switcher shows them. */
  accounts: Account[];
  /** Every account with trades is selected. */
  all: boolean;
  period: PeriodKey;
  /** Empty means every session. */
  sessions: Session[];
  /** Empty means both directions. */
  directions: Direction[];
  /** One rubric version, or null for every one. */
  rubric: number | null;
  /** A date range (YYYY-MM-DD, inclusive). By market day: a backtest's chart date. */
  from: string | null;
  to: string | null;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const list = <T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T[] => {
  const raw = (Array.isArray(v) ? v.join(',') : v ?? '').split(',').map((s) => s.trim());
  return allowed.filter((a) => raw.includes(a));
};

/**
 * The scope asked for. `remembered` is the last account choice (the cookie);
 * with neither, the busiest real account — Missed and Backtest open only by
 * choosing them or All.
 */
export function parseStatsScope(params: Params, available: Account[], remembered?: string): StatsScope {
  const asked = one(params.account) ?? remembered ?? '';
  let accounts: Account[];
  if (asked === 'All') accounts = [...available];
  else {
    const picked = list(asked, ACCOUNT_VALUES).filter((a) => available.includes(a));
    accounts = picked.length ? available.filter((a) => picked.includes(a))
      : [available.find((a) => isReal(a)) ?? available[0] ?? 'Live'];
  }
  const periodKey = one(params.period);
  return {
    accounts,
    all: available.length > 0 && available.every((a) => accounts.includes(a)),
    period: (PERIODS.some((p) => p.key === periodKey) ? periodKey : 'all') as PeriodKey,
    sessions: list(params.session, SESSIONS),
    directions: list(params.dir, DIRECTIONS),
    rubric: /^\d+$/.test(one(params.rubric) ?? '') ? Number(one(params.rubric)) : null,
    from: /^\d{4}-\d{2}-\d{2}$/.test(one(params.from) ?? '') ? one(params.from)! : null,
    to: /^\d{4}-\d{2}-\d{2}$/.test(one(params.to) ?? '') ? one(params.to)! : null,
  };
}

/** The first day (YYYY-MM-DD, local) a period covers, or null for all time. */
export function periodStart(period: PeriodKey, now = new Date()): string | null {
  const back = (days: number) => { const d = new Date(now); d.setDate(d.getDate() - days + 1); return localDay(d); };
  switch (period) {
    case 'month': return `${localDay(now).slice(0, 7)}-01`;
    case '30d': return back(30);
    case '90d': return back(90);
    case 'year': return `${now.getFullYear()}-01-01`;
    default: return null;
  }
}

/**
 * The trades in scope. A period leaves out undated backtests — they have no
 * day to fall in — and says how many it left out (see `undatedOut`).
 */
export function applyStatsScope(trades: Trade[], scope: StatsScope, now = new Date()): Trade[] {
  const from = periodStart(scope.period, now);
  const ranged = scope.from != null || scope.to != null;
  return trades.filter((t) => {
    const day = marketDay(t);
    return scope.accounts.includes(t.account)
      && (from == null || (isDated(t) && t.date.slice(0, 10) >= from))
      && (!ranged || (day != null && (scope.from == null || day >= scope.from) && (scope.to == null || day <= scope.to)))
      && (scope.rubric == null || t.rubric_version === scope.rubric)
      && (!scope.sessions.length || scope.sessions.includes(t.session))
      && (!scope.directions.length || scope.directions.includes(t.direction));
  });
}

/** The URL value for a set of accounts: 'All' when it is every one. */
export function accountParam(accounts: readonly string[], available: readonly string[]): string {
  return available.length > 0 && available.every((a) => accounts.includes(a)) ? 'All' : accounts.join(',');
}

/** Whether a selection mixes real trades with replays or missed setups. */
export function mixesWorlds(accounts: readonly Account[]): boolean {
  return accounts.some((a) => isReal(a)) && accounts.some((a) => !isReal(a));
}
