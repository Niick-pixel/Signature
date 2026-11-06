/**
 * Consistency: did you do the process, day by day — not did you make money.
 *
 * Four rings for each trading day:
 *   Prep     the morning check-in and the chart prep (4+ steps)
 *   Rules    no written rule broken (a day with no trades breaks nothing)
 *   Trades   every trade finished (backtests too): settled, not a quick log, a lesson
 *   Journal  a journal page or the day's review — once a day, traded or not
 * A ring that does not apply (no trades → nothing to journal) is "na" and
 * counts neither way. Pure — db/consistency gathers the days.
 *
 * Streaks are fair: only trading days count (weekends and US market holidays
 * are skipped, never broken), and with the rest-day option one open day a
 * week is forgiven.
 */
import { isTradingDay, marketHoliday } from './marketHolidays';

export type RingId = 'prep' | 'rules' | 'journal' | 'review';
export const RINGS: ReadonlyArray<{ id: RingId; label: string; hint: string }> = [
  { id: 'prep', label: 'Prep', hint: 'The morning check-in and the chart prep, every step.' },
  { id: 'rules', label: 'Rules', hint: 'No written rule broken. A day you sat out breaks nothing.' },
  { id: 'journal', label: 'Trades', hint: 'Every trade finished — backtests included: settled, not a quick log, with a lesson.' },
  { id: 'review', label: 'Journal', hint: 'Journal once a day: a journal page or the day review, every trading day — traded or not.' },
];
export type RingState = 'done' | 'open' | 'na';

export interface DayInput {
  day: string;
  checkedIn: boolean;
  prepSteps: number;
  /** The prep counts as done (lib/prep prepProgress().complete); without it, the old rule: 4 steps. */
  prepComplete?: boolean;
  /** Trades taken that day: real accounts and dated backtests. */
  trades: number;
  /** Of those, backtests. */
  backtests?: number;
  /** Of those, how many broke a rule (trade, day or self-reported). */
  broke: number;
  /** Of those, how many are unfinished (quick log, still Live, or no lesson). */
  unfinished: number;
  reviewed: boolean;
}

export interface DayRings {
  day: string;
  rings: Record<RingId, RingState>;
  done: number;
  of: number;
  /** Every ring that applies is done. */
  closed: boolean;
  tradingDay: boolean;
  holiday: string | null;
  /** Trades taken that day, and how many were backtests. */
  trades: number;
  backtests: number;
}

export function dayRings(d: DayInput): DayRings {
  const rings: Record<RingId, RingState> = {
    prep: d.checkedIn && (d.prepComplete ?? d.prepSteps >= 4) ? 'done' : 'open',
    rules: d.broke > 0 ? 'open' : 'done',
    journal: d.trades === 0 ? 'na' : d.unfinished === 0 ? 'done' : 'open',
    // Journal once a day: every day, traded or not.
    review: d.reviewed ? 'done' : 'open',
  };
  const applied = Object.values(rings).filter((s) => s !== 'na');
  const done = applied.filter((s) => s === 'done').length;
  return { day: d.day, rings, done, of: applied.length, closed: done === applied.length, tradingDay: isTradingDay(d.day), holiday: marketHoliday(d.day), trades: d.trades, backtests: d.backtests ?? 0 };
}

export const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));

export interface StreakOptions {
  /** Count only trading days (skip weekends and holidays). */
  tradingOnly: boolean;
  /** Forgive one open day in each Monday–Sunday week. */
  restDay: boolean;
}

export interface Streak { current: number; best: number; rested: string[] }

/**
 * Days in a row that were kept, ending today — or yesterday while today is
 * still open, so a morning never shows a broken streak. Days that do not
 * count (weekends, holidays when tradingOnly) are skipped. With restDay, the
 * first open day of a week is a rest day: it does not add, it does not break.
 * `kept(day)` is null for a day with no record at all (before the journal began).
 */
export function fairStreak(kept: (day: string) => boolean | null, today: string, opts: StreakOptions, earliest: string): Streak {
  const counts = (d: string) => !opts.tradingOnly || isTradingDay(d);
  // Walk forward from the start so "best" and the rest-day rule see the same history.
  let run = 0; let best = 0; const restedWeeks = new Set<string>(); let rested: string[] = [];
  for (let d = earliest; d <= today; d = addDays(d, 1)) {
    if (!counts(d)) continue;
    const k = kept(d);
    if (d === today && !k) break; // today still open: not a break yet
    if (k) { run += 1; best = Math.max(best, run); continue; }
    const week = mondayOf(d);
    if (opts.restDay && !restedWeeks.has(week)) { restedWeeks.add(week); rested.push(d); continue; }
    run = 0; rested = [];
  }
  return { current: run, best: Math.max(best, run), rested };
}

export interface WeekReport {
  monday: string;
  days: DayRings[];
  closedDays: number;
  tradingDays: number;
  ringRates: Record<RingId, { done: number; of: number }>;
  lastWeek: Record<RingId, { done: number; of: number }>;
  /** The ring most often left open this week — the one to work on. Null when every ring was closed. */
  weakest: RingId | null;
  tradesTaken: number;
  tradesBroke: number;
}

function rates(days: readonly DayRings[]): Record<RingId, { done: number; of: number }> {
  const out = Object.fromEntries(RINGS.map((r) => [r.id, { done: 0, of: 0 }])) as Record<RingId, { done: number; of: number }>;
  for (const d of days) for (const r of RINGS) {
    const s = d.rings[r.id];
    if (s === 'na') continue;
    out[r.id].of += 1;
    if (s === 'done') out[r.id].done += 1;
  }
  return out;
}

/** The Sunday report: this week's trading days against last week's. `inputs` covers both weeks. */
export function weekReport(monday: string, inputs: readonly DayInput[]): WeekReport {
  const inWeek = (m: string) => (d: DayInput) => d.day >= m && d.day < addDays(m, 7) && isTradingDay(d.day);
  const days = inputs.filter(inWeek(monday)).map(dayRings).sort((a, b) => a.day.localeCompare(b.day));
  const prev = inputs.filter(inWeek(addDays(monday, -7))).map(dayRings);
  const ringRates = rates(days);
  let weakest: RingId | null = null; let worst = 0;
  for (const r of RINGS) {
    const { done, of } = ringRates[r.id];
    const missed = of - done;
    if (missed > worst) { worst = missed; weakest = r.id; }
  }
  const week = inputs.filter(inWeek(monday));
  return {
    monday, days, closedDays: days.filter((d) => d.closed).length, tradingDays: days.length,
    ringRates, lastWeek: rates(prev), weakest,
    tradesTaken: week.reduce((s, d) => s + d.trades, 0), tradesBroke: week.reduce((s, d) => s + d.broke, 0),
  };
}
