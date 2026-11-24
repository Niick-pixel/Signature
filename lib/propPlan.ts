/**
 * Prop rules as arithmetic (big update, #8): today's room before each rule, a what-if over the next
 * days, and contracts for a stop and a risk. Pure and client-safe. It says what the rules allow,
 * never what to trade — a size is maths, not a signal.
 */
import type { PropAccount, PropStanding } from './prop';

const round = (v: number) => Math.round(v * 100) / 100;

/* ───────────── today ───────────── */

export interface TodayRoom {
  /** Dollars that can still be lost today before a rule is hit, and which rule comes first. */
  canLose: number;
  firstLimit: 'daily' | 'drawdown';
  /**
   * Consistency: above this much profit today, today becomes a best day bigger than the rule allows
   * and more profit on other days is then needed. Null when there is no consistency rule, or no
   * profit yet to measure against.
   */
  consistencyRoom: number | null;
  /** Still to make for the profit target (evaluations), or null. */
  toTarget: number | null;
  /** Trading days still needed for the minimum. */
  daysLeft: number;
}

export function todayRoom(a: Pick<PropAccount, 'consistency' | 'profit_target' | 'phase' | 'min_days'>, s: Pick<PropStanding, 'room' | 'today' | 'days' | 'profit' | 'tradingDays'>, today: string): TodayRoom {
  const daily = s.today.dailyLeft;
  const canLose = round(Math.max(0, daily != null ? Math.min(daily, s.room) : s.room));
  let consistencyRoom: number | null = null;
  if (a.consistency && a.consistency < 1) {
    const others = s.days.filter((d) => d.day !== today && d.trades > 0);
    const profitOthers = others.reduce((x, d) => x + d.pnl, 0);
    const bestOther = others.reduce((b, d) => Math.max(b, d.pnl), 0);
    if (profitOthers > 0) {
      // Today stays inside the rule while it is not the best day, or while today ≤ c·(others + today).
      const cap = Math.max(bestOther, (a.consistency * profitOthers) / (1 - a.consistency));
      consistencyRoom = round(Math.max(0, cap - s.today.pnl));
    }
  }
  return {
    canLose, firstLimit: daily != null && daily <= s.room ? 'daily' : 'drawdown', consistencyRoom,
    toTarget: a.phase === 'eval' && a.profit_target != null ? round(Math.max(0, a.profit_target - s.profit)) : null,
    daysLeft: Math.max(0, (a.min_days ?? 0) - s.tradingDays),
  };
}

/* ───────────── what if ───────────── */

export interface SimDay { n: number; pnl: number; balance: number; floor: number; note: string | null }
export interface Simulation {
  days: SimDay[];
  /** The first day the balance would touch the floor, or break the daily limit. */
  breach: { n: number; rule: 'drawdown' | 'daily' } | null;
  profit: number;
  tradingDays: number;
  best: number;
  consistencyRatio: number | null;
  consistencyOk: boolean;
  targetMet: boolean | null;
  daysOk: boolean;
  /** Every pass condition the journal can see, met (evaluations); null for a funded account. */
  passes: boolean | null;
}

/** Parse "+400, -250 300" into day P&Ls. Anything not a number is skipped. */
export const parsePlan = (text: string): number[] =>
  text.split(/[\s,;]+/).map((x) => Number(x.replace(/[$+]/g, ''))).filter((x) => Number.isFinite(x) && x !== 0).slice(0, 60);

/**
 * The account carried forward over the given day P&Ls, from where it stands now, by its own rules: the
 * floor trails the end-of-day high (an intraday trail is read a day at a time, its best case), and
 * locks where the firm locks it.
 */
export function simulate(a: Pick<PropAccount, 'start_balance' | 'max_drawdown' | 'trail_lock' | 'drawdown_type' | 'daily_loss' | 'consistency' | 'profit_target' | 'phase' | 'min_days'>,
  s: Pick<PropStanding, 'balance' | 'peak' | 'floor' | 'profit' | 'days' | 'tradingDays'>, plan: readonly number[]): Simulation {
  const lock = a.trail_lock == null ? Infinity : a.start_balance + a.trail_lock;
  let balance = s.balance; let peak = s.peak; let floor = s.floor;
  let breach: Simulation['breach'] = null;
  const days: SimDay[] = [];
  plan.forEach((pnl, i) => {
    balance = round(balance + pnl);
    let note: string | null = null;
    if (!breach && a.daily_loss && pnl <= -a.daily_loss) { breach = { n: i + 1, rule: 'daily' }; note = 'daily limit'; }
    if (!breach && balance <= floor) { breach = { n: i + 1, rule: 'drawdown' }; note = 'touches the floor'; }
    if (a.drawdown_type !== 'static') { peak = Math.max(peak, balance); floor = Math.max(floor, Math.min(peak - a.max_drawdown, lock)); }
    days.push({ n: i + 1, pnl, balance, floor: round(floor), note });
  });
  const past = s.days.filter((d) => d.trades > 0).map((d) => d.pnl);
  const all = [...past, ...plan];
  const profit = round(s.profit + plan.reduce((x, p) => x + p, 0));
  const best = all.length ? Math.max(...all) : 0;
  const total = all.reduce((x, p) => x + p, 0);
  const ratio = total > 0 && best > 0 ? round(best / total) : null;
  const consistencyOk = !a.consistency || ratio == null || ratio <= a.consistency;
  const tradingDays = s.tradingDays + plan.length;
  const daysOk = tradingDays >= (a.min_days ?? 0);
  const targetMet = a.phase === 'eval' && a.profit_target != null ? profit >= a.profit_target : null;
  return { days, breach, profit, tradingDays, best, consistencyRatio: ratio, consistencyOk, targetMet, daysOk,
    passes: a.phase === 'eval' ? Boolean(targetMet) && consistencyOk && daysOk && !breach : null };
}

/* ───────────── size ───────────── */

/** Dollars per point, per contract. */
export const POINT_VALUE: Record<string, number> = { NQ: 20, MNQ: 2, ES: 50, MES: 5 };

export interface SizeLine { instrument: string; contracts: number; risk: number; perContract: number }

/**
 * Contracts that keep the risk at or under `risk` dollars for a stop of `stopPoints`, per instrument:
 * always rounded down, and capped by the account's max (in minis: a micro is a tenth) when it has one.
 */
export function sizeFor(stopPoints: number, risk: number, maxMinis: number | null = null, instruments: readonly string[] = ['NQ', 'MNQ']): SizeLine[] {
  if (!(stopPoints > 0) || !(risk > 0)) return [];
  return instruments.map((instrument) => {
    const pv = POINT_VALUE[instrument] ?? 0;
    const perContract = round(stopPoints * pv);
    let contracts = perContract > 0 ? Math.floor(risk / perContract + 1e-9) : 0;
    if (maxMinis != null) contracts = Math.min(contracts, Math.floor(maxMinis * (instrument.startsWith('M') ? 10 : 1)));
    return { instrument, contracts, risk: round(contracts * perContract), perContract };
  });
}
