/**
 * The prop firm hub: an account's rules, and where it stands against each
 * one, worked out from the trades logged on it. Pure — the database layer
 * passes the rows in.
 *
 * Every figure here is a reading of the journal, never a gate: a breached
 * drawdown is shown, dated and explained, and nothing stops a trade from
 * being logged. Firms change their rules often — the presets are typical
 * values to start from, editable on every account.
 */
import { isTaken } from './domain';
import { pnlOf } from './stats';
import { TRADER_UTC_OFFSET_HOURS } from './planMatch';
import type { Trade } from './types';

export type DrawdownType = 'eod_trailing' | 'intraday_trailing' | 'static';
export const DRAWDOWN_LABEL: Record<DrawdownType, string> = {
  eod_trailing: 'End-of-day trailing', intraday_trailing: 'Intraday trailing', static: 'Static',
};
export type Phase = 'eval' | 'funded';
export type PropStatus = 'active' | 'passed' | 'failed' | 'archived';
export type JournalAccount = 'Demo' | 'Live' | 'Eval' | 'Funded';

export interface PropRules {
  start_balance: number;
  profit_target: number | null;
  drawdown_type: DrawdownType;
  max_drawdown: number;
  trail_lock: number | null;
  daily_loss: number | null;
  consistency: number | null;
  min_days: number | null;
  max_contracts: number | null;
  qualify_amount: number | null;
  payout_days: number | null;
  payout_min: number | null;
  payout_max: number | null;
  payout_split: number | null;
  price: number | null;
}

export interface PropAccount extends PropRules {
  id: string; firm: string; plan: string; label: string; phase: Phase; journal_account: JournalAccount; status: PropStatus;
  started_on: string; ended_on: string | null; from_account_id: string | null; notes: string | null; created_at: string;
}

export interface PropPayout { id: string; account_id: string; date: string; amount: number; received: number | null; status: 'requested' | 'paid' | 'denied'; note: string | null; created_at: string }

/* ───────────────────────── presets ───────────────────────── */

export interface Preset { firm: string; plan: string; phase: Phase; rules: PropRules; note?: string }

const R = (x: Partial<PropRules> & Pick<PropRules, 'start_balance' | 'max_drawdown'>): PropRules => ({
  profit_target: null, drawdown_type: 'eod_trailing', trail_lock: null, daily_loss: null, consistency: null, min_days: null,
  max_contracts: null, qualify_amount: null, payout_days: null, payout_min: null, payout_max: null, payout_split: null, price: null, ...x,
});

/**
 * Typical plans in every common size. Firms revise these often — every
 * number is a starting point, edited per account on its Rules tab.
 * Per firm: size → [target, max drawdown, daily loss | null, max contracts (minis), eval price].
 */
type SizeRow = [number, number, number | null, number, number | null];
interface FirmSpec {
  firm: string; evalName: string; fundedName: string; sizes: Record<number, SizeRow>;
  eval: Partial<PropRules>; funded: Partial<PropRules>; activation?: number | null; note?: string;
}
const FIRMS: FirmSpec[] = [
  { firm: 'Apex Trader Funding', evalName: 'evaluation', fundedName: 'performance account',
    sizes: { 25000: [1500, 1500, null, 4, 147], 50000: [3000, 2500, null, 10, 167], 100000: [6000, 3000, null, 14, 207], 150000: [9000, 5000, null, 17, 297] },
    eval: { drawdown_type: 'intraday_trailing', trail_lock: 100 },
    funded: { drawdown_type: 'intraday_trailing', trail_lock: 100, consistency: 0.3, qualify_amount: 50, payout_days: 8, payout_min: 500, payout_split: 0.9 }, activation: 85 },
  { firm: 'Topstep', evalName: 'Trading Combine', fundedName: 'Express Funded',
    sizes: { 50000: [3000, 2000, 1000, 5, 49], 100000: [6000, 3000, 2000, 10, 99], 150000: [9000, 4500, 3000, 15, 149] },
    eval: { trail_lock: 0, consistency: 0.5, min_days: 2 },
    funded: { trail_lock: 0, qualify_amount: 150, payout_days: 5, payout_split: 0.9 }, activation: 149 },
  { firm: 'Lucid Trading', evalName: 'LucidFlex evaluation', fundedName: 'LucidFlex funded',
    sizes: { 25000: [1250, 1000, null, 2, 100], 50000: [3000, 2000, null, 4, 130], 100000: [6000, 3000, null, 6, 225], 150000: [9000, 4500, null, 10, 340] },
    eval: { trail_lock: 100, consistency: 0.5, min_days: 2 },
    funded: { trail_lock: 100, qualify_amount: 150, payout_days: 5, payout_min: 500, payout_split: 0.9 } },
  { firm: 'Take Profit Trader', evalName: 'test', fundedName: 'PRO account',
    sizes: { 25000: [1500, 1500, null, 3, 150], 50000: [3000, 2000, null, 6, 170], 75000: [4500, 2500, null, 9, 245], 100000: [6000, 3000, null, 12, 330], 150000: [9000, 4500, null, 15, 360] },
    eval: { consistency: 0.5, min_days: 5 }, funded: { payout_split: 0.8 }, activation: 130 },
  { firm: 'Tradeify', evalName: 'Growth evaluation', fundedName: 'funded',
    sizes: { 50000: [3000, 2000, 1250, 4, 99], 100000: [6000, 3500, 2500, 8, 179], 150000: [9000, 5000, 3750, 12, 249] },
    eval: { trail_lock: 100, min_days: 1 }, funded: { trail_lock: 100, payout_split: 0.9 } },
  { firm: 'My Funded Futures', evalName: 'Core evaluation', fundedName: 'funded',
    sizes: { 50000: [3000, 2000, null, 3, 77], 100000: [6000, 3000, null, 6, 150], 150000: [9000, 4500, null, 9, 220] },
    eval: { trail_lock: 100, consistency: 0.5, min_days: 2 }, funded: { trail_lock: 100, payout_split: 0.9 } },
  { firm: 'Upcomers', evalName: 'evaluation (fill in from the firm)', fundedName: 'funded (fill in)',
    sizes: { 25000: [1500, 1500, null, 3, null], 50000: [3000, 2000, null, 5, null], 100000: [6000, 3000, null, 10, null], 150000: [9000, 4500, null, 15, null] },
    eval: {}, funded: {}, note: 'No rules built in for this firm — check its rules page and edit every field.' },
];

export const sizeLabel = (n: number) => `${Math.round(n / 1000)}K`;

export const PRESETS: Preset[] = [
  ...FIRMS.flatMap((f) => Object.entries(f.sizes).flatMap(([size, [target, dd, daily, contracts, price]]) => {
    const start = Number(size);
    return [
      { firm: f.firm, plan: `${sizeLabel(start)} ${f.evalName}`, phase: 'eval' as const, note: f.note,
        rules: R({ start_balance: start, profit_target: target, max_drawdown: dd, daily_loss: daily, max_contracts: contracts, price, ...f.eval }) },
      { firm: f.firm, plan: `${sizeLabel(start)} ${f.fundedName}`, phase: 'funded' as const, note: f.note,
        rules: R({ start_balance: start, max_drawdown: dd, daily_loss: daily, max_contracts: contracts, price: f.activation ?? null,
          payout_max: Math.round(Math.min(start * 0.05, 5000) / 100) * 100 || null, ...f.funded }) },
    ];
  })),
  { firm: 'Custom', plan: 'My own rules', phase: 'eval', rules: R({ start_balance: 50000, max_drawdown: 2000 }) },
];

/* ───────────────────────── trading days ───────────────────────── */

export type DayBoundary = 'calendar' | 'cme';

const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * The trading day a trade counts on. 'calendar': its own date. 'cme': the
 * futures session, which opens at 6pm New York — a trade at or after 18:00
 * New York belongs to the next day, as the firms count it.
 */
export function sessionDay(date: string, boundary: DayBoundary): string {
  if (boundary === 'calendar') return date.slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(date);
  if (!m) return date.slice(0, 10);
  const utc = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) - TRADER_UTC_OFFSET_HOURS * 3600_000;
  const p = Object.fromEntries(NY.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  const nyDay = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) >= 18 ? addDays(nyDay, 1) : nyDay;
}

/* ───────────────────────── which trades ───────────────────────── */

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * The trades that are this account's own: on its journal account, with its
 * label (or, with no label, any label no other prop account claims), from
 * its first day to its last. Planned, missed and undated trades never count.
 */
export function tradesFor(a: Pick<PropAccount, 'id' | 'label' | 'journal_account' | 'started_on' | 'ended_on'>, trades: readonly Trade[],
  all: ReadonlyArray<Pick<PropAccount, 'id' | 'label' | 'journal_account'>>, boundary: DayBoundary = 'calendar'): Trade[] {
  const claimed = new Set(all.filter((o) => o.id !== a.id && o.journal_account === a.journal_account && o.label.trim()).map((o) => norm(o.label)));
  return trades.filter((t) => {
    if (t.deleted_at || t.undated || t.status === 'Planned' || !isTaken(t.outcome) || t.account !== a.journal_account) return false;
    if (a.label.trim() ? norm(t.account_label) !== norm(a.label) : claimed.has(norm(t.account_label))) return false;
    const d = sessionDay(t.date, boundary);
    return d >= a.started_on && (!a.ended_on || d <= a.ended_on);
  }).sort((x, y) => x.date.localeCompare(y.date));
}

/* ───────────────────────── where it stands ───────────────────────── */

export interface DayLine { day: string; pnl: number; trades: number; balance: number; floor: number }

export interface RuleLine {
  key: 'drawdown' | 'daily' | 'target' | 'consistency' | 'days' | 'contracts' | 'payout';
  label: string;
  /** ok: kept / met · warn: close · broken: breached (dated) · pending: not met yet · na: not a rule here. */
  state: 'ok' | 'warn' | 'broken' | 'pending';
  /** The one line: where it stands. */
  text: string;
  /** 0–1, for a bar, when it has one. */
  progress?: number;
}

export interface PropStanding {
  balance: number;
  profit: number;
  floor: number;
  /** Dollars above the drawdown floor. */
  room: number;
  /** The first day (or trade time, intraday) the balance touched the floor. */
  breachedOn: string | null;
  peak: number;
  today: { pnl: number; dailyLeft: number | null };
  dailyBreaches: string[];
  tradingDays: number;
  best: { day: string; pnl: number } | null;
  /** Best day over total profit; null when there is no profit to measure against. */
  consistencyRatio: number | null;
  /** More total profit needed for the best day to fit the consistency rule. */
  consistencyNeed: number | null;
  oversize: Array<{ id: string; date: string; contracts: number; minis: number }>;
  payout: { since: string | null; qualifying: number; profitSince: number; eligible: boolean; available: number; reasons: string[] } | null;
  targetReached: boolean;
  unpriced: number;
  days: DayLine[];
  rules: RuleLine[];
  paidOut: number;
  received: number;
}

const round = (v: number) => Math.round(v * 100) / 100;
const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/** Contracts as minis: a micro is a tenth. */
const minisOf = (t: Pick<Trade, 'contracts' | 'instrument'>) => (t.contracts ?? 0) / (t.instrument === 'MNQ' ? 10 : 1);

export function propStanding(a: PropAccount, own: readonly Trade[], payouts: readonly PropPayout[], today: string,
  opts: { boundary?: DayBoundary; warnShare?: number } = {}): PropStanding {
  const boundary = opts.boundary ?? 'calendar';
  const warnShare = opts.warnShare ?? 0.25;
  const start = a.start_balance;
  const lock = a.trail_lock == null ? Infinity : start + a.trail_lock;
  const out = payouts.filter((p) => p.status !== 'denied').sort((x, y) => x.date.localeCompare(y.date));
  const outOn = (day: string) => out.filter((p) => p.date === day).reduce((s, p) => s + p.amount, 0);

  let unpriced = 0;
  const byDay = new Map<string, { pnl: number; trades: Trade[] }>();
  for (const t of own) {
    const v = pnlOf(t);
    if (v == null) unpriced += 1;
    const d = sessionDay(t.date, boundary);
    const cur = byDay.get(d) ?? { pnl: 0, trades: [] };
    cur.pnl = round(cur.pnl + (v ?? 0)); cur.trades.push(t);
    byDay.set(d, cur);
  }
  // Payout days with no trades still move the balance.
  for (const p of out) if (!byDay.has(p.date)) byDay.set(p.date, { pnl: 0, trades: [] });
  const dayKeys = [...byDay.keys()].sort();

  let balance = start; let peak = start; let floor = Math.min(start - a.max_drawdown, lock);
  let breachedOn: string | null = null;
  const days: DayLine[] = [];
  for (const d of dayKeys) {
    const { pnl, trades } = byDay.get(d)!;
    if (a.drawdown_type === 'intraday_trailing') {
      // Trade by trade (the journal has no ticks): the peak after each trade.
      for (const t of trades) {
        balance = round(balance + (pnlOf(t) ?? 0));
        if (balance <= floor && !breachedOn) breachedOn = `${d} ${t.date.slice(11, 16)}`;
        peak = Math.max(peak, balance);
        floor = Math.max(floor, Math.min(peak - a.max_drawdown, lock));
      }
    } else {
      balance = round(balance + pnl);
      if (balance <= floor && !breachedOn) breachedOn = d;
      if (a.drawdown_type === 'eod_trailing') {
        peak = Math.max(peak, balance);
        floor = Math.max(floor, Math.min(peak - a.max_drawdown, lock));
      }
    }
    balance = round(balance - outOn(d));
    days.push({ day: d, pnl, trades: trades.length, balance, floor: round(floor) });
  }

  const tradeDays = days.filter((d) => d.trades > 0);
  const totalPnl = round(tradeDays.reduce((s, d) => s + d.pnl, 0));
  const best = tradeDays.length ? tradeDays.reduce((b, d) => (d.pnl > b.pnl ? d : b)) : null;
  const ratio = best && totalPnl > 0 && best.pnl > 0 ? round(best.pnl / totalPnl) : null;
  const need = a.consistency && best && best.pnl > 0 ? Math.max(0, round(best.pnl / a.consistency - totalPnl)) : null;
  const todayPnl = byDay.get(today)?.pnl ?? 0;
  const dailyBreaches = a.daily_loss ? tradeDays.filter((d) => d.pnl <= -a.daily_loss!).map((d) => d.day) : [];
  const oversize = a.max_contracts ? own.filter((t) => minisOf(t) > a.max_contracts!)
    .map((t) => ({ id: t.id, date: t.date, contracts: t.contracts ?? 0, minis: round(minisOf(t)) })) : [];
  const profit = round(balance - start + out.reduce((s, p) => s + p.amount, 0));
  const consistencyOk = !a.consistency || ratio == null || ratio <= a.consistency;
  const targetReached = a.phase === 'eval' && a.profit_target != null && profit >= a.profit_target
    && tradeDays.length >= (a.min_days ?? 0) && consistencyOk && !breachedOn;

  // Payouts (funded): qualifying days and profit since the last one.
  let payout: PropStanding['payout'] = null;
  if (a.phase === 'funded') {
    const since = out.length ? out[out.length - 1].date : null;
    const after = tradeDays.filter((d) => !since || d.day > since);
    const qualifying = after.filter((d) => d.pnl >= (a.qualify_amount ?? 0.01)).length;
    const profitSince = round(after.reduce((s, d) => s + d.pnl, 0));
    const reasons: string[] = [];
    if (a.payout_days && qualifying < a.payout_days) reasons.push(`${a.payout_days - qualifying} more qualifying day${a.payout_days - qualifying === 1 ? '' : 's'}${a.qualify_amount ? ` (${usd(a.qualify_amount)}+)` : ''}`);
    if (a.payout_min && profitSince < a.payout_min) reasons.push(`${usd(a.payout_min - profitSince)} more profit since the last payout`);
    if (!consistencyOk) reasons.push(`best day is ${Math.round((ratio ?? 0) * 100)}% of profit (max ${Math.round((a.consistency ?? 0) * 100)}%)`);
    if (breachedOn) reasons.push('the drawdown was breached');
    const available = Math.max(0, round(Math.min(a.payout_max ?? Infinity, balance - Math.max(start, floor))));
    if (!available && !reasons.length) reasons.push('no profit above the floor to take');
    payout = { since, qualifying, profitSince, eligible: reasons.length === 0, available, reasons };
  }

  const room = round(balance - floor);
  const rules: RuleLine[] = [];
  rules.push({
    key: 'drawdown', label: `${DRAWDOWN_LABEL[a.drawdown_type]} drawdown`,
    state: breachedOn ? 'broken' : room <= a.max_drawdown * warnShare ? 'warn' : 'ok',
    text: breachedOn ? `Touched the floor on ${breachedOn}` : `${usd(room)} above the floor (${usd(floor)})${floor >= lock ? ' · locked' : ''}`,
    progress: Math.max(0, Math.min(1, room / a.max_drawdown)),
  });
  if (a.daily_loss) {
    const left = round(a.daily_loss + Math.min(0, todayPnl));
    rules.push({
      key: 'daily', label: 'Daily loss limit',
      state: todayPnl <= -a.daily_loss ? 'broken' : left <= a.daily_loss * warnShare ? 'warn' : dailyBreaches.length ? 'warn' : 'ok',
      text: `${usd(left)} left today${dailyBreaches.length ? ` · hit on ${dailyBreaches.length} day${dailyBreaches.length === 1 ? '' : 's'} (last ${dailyBreaches[dailyBreaches.length - 1]})` : ''}`,
      progress: Math.max(0, Math.min(1, left / a.daily_loss)),
    });
  }
  if (a.phase === 'eval' && a.profit_target) {
    rules.push({
      key: 'target', label: 'Profit target', state: profit >= a.profit_target ? 'ok' : 'pending',
      text: profit >= a.profit_target ? `Reached: ${usd(profit)} of ${usd(a.profit_target)}` : `${usd(a.profit_target - profit)} to go (${usd(profit)} of ${usd(a.profit_target)})`,
      progress: Math.max(0, Math.min(1, profit / a.profit_target)),
    });
  }
  if (a.consistency) {
    rules.push({
      key: 'consistency', label: `Consistency (best day ≤ ${Math.round(a.consistency * 100)}%)`,
      state: ratio == null ? 'pending' : consistencyOk ? 'ok' : 'warn',
      text: ratio == null ? 'Measured once there is profit'
        : consistencyOk ? `Best day ${usd(best!.pnl)} is ${Math.round(ratio * 100)}% of ${usd(totalPnl)}`
        : `Best day ${usd(best!.pnl)} is ${Math.round(ratio * 100)}% — ${usd(need ?? 0)} more profit fixes it`,
      progress: ratio == null ? undefined : Math.min(1, ratio / a.consistency),
    });
  }
  if (a.min_days) {
    rules.push({
      key: 'days', label: 'Minimum trading days', state: tradeDays.length >= a.min_days ? 'ok' : 'pending',
      text: `${tradeDays.length} of ${a.min_days}`, progress: Math.min(1, tradeDays.length / a.min_days),
    });
  }
  if (a.max_contracts) {
    rules.push({
      key: 'contracts', label: `Max ${a.max_contracts} contracts (minis)`, state: oversize.length ? 'broken' : 'ok',
      text: oversize.length ? `${oversize.length} trade${oversize.length === 1 ? '' : 's'} over size (last ${oversize[oversize.length - 1].date.slice(0, 10)})` : 'Every trade within size',
    });
  }
  if (payout) {
    rules.push({
      key: 'payout', label: 'Payout', state: payout.eligible ? 'ok' : 'pending',
      text: payout.eligible ? `Eligible · about ${usd(payout.available)} available` : `Not yet: ${payout.reasons.join(' · ')}`,
      progress: a.payout_days ? Math.min(1, payout.qualifying / a.payout_days) : undefined,
    });
  }

  return {
    balance, profit, floor: round(floor), room, breachedOn, peak: round(peak),
    today: { pnl: todayPnl, dailyLeft: a.daily_loss ? round(a.daily_loss + Math.min(0, todayPnl)) : null },
    dailyBreaches, tradingDays: tradeDays.length, best: best ? { day: best.day, pnl: best.pnl } : null,
    consistencyRatio: ratio, consistencyNeed: need, oversize, payout, targetReached, unpriced, days, rules,
    paidOut: round(out.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0)),
    received: round(out.filter((p) => p.status === 'paid').reduce((s, p) => s + (p.received ?? p.amount * (a.payout_split ?? 1)), 0)),
  };
}

/** Across every account: what the firms cost and what they paid. */
export function propLedger(costs: ReadonlyArray<{ cost: number }>, standings: ReadonlyArray<Pick<PropStanding, 'received'>>) {
  const spent = round(costs.reduce((s, c) => s + c.cost, 0));
  const received = round(standings.reduce((s, x) => s + x.received, 0));
  return { spent, received, net: round(received - spent) };
}

/** Rules from a request body: numbers checked, nonsense dropped to null (never a refusal over a typo). */
export function readRules(b: Record<string, unknown>, base: PropRules): PropRules {
  const n = (k: keyof PropRules, min = 0) => {
    if (!(k in b)) return base[k] as number | null;
    const v = b[k] === '' || b[k] == null ? null : Number(b[k]);
    return v == null || !Number.isFinite(v) || v < min ? null : v;
  };
  const share = (k: 'consistency' | 'payout_split') => {
    const v = n(k);
    if (v == null) return null;
    const f = v > 1 ? v / 100 : v; // 50 → 0.5
    return f > 0 && f <= 1 ? f : null;
  };
  const start = n('start_balance');
  const dd = n('max_drawdown');
  return {
    start_balance: start && start > 0 ? start : base.start_balance,
    profit_target: n('profit_target') || null,
    drawdown_type: (['eod_trailing', 'intraday_trailing', 'static'] as const).includes(b.drawdown_type as DrawdownType) ? b.drawdown_type as DrawdownType : base.drawdown_type,
    max_drawdown: dd && dd > 0 ? dd : base.max_drawdown,
    trail_lock: n('trail_lock', -1e9),
    daily_loss: n('daily_loss') || null,
    consistency: share('consistency'),
    min_days: n('min_days') == null ? null : Math.round(n('min_days')!),
    max_contracts: n('max_contracts') || null,
    qualify_amount: n('qualify_amount'),
    payout_days: n('payout_days') == null ? null : Math.round(n('payout_days')!),
    payout_min: n('payout_min'),
    payout_max: n('payout_max'),
    payout_split: share('payout_split'),
    price: n('price'),
  };
}
