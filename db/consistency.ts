import 'server-only';
import { getDb } from './index';
import { listTrades } from './trades';
import { listDailyReviews } from './reviews';
import { listPreps } from './prep';
import { journalDays } from './journal';
import { reviewInputs } from './review';
import { isReal, isTaken } from '../lib/domain';
import { prepProgress } from '../lib/prep';
import { dayBreaksByTrade, planBreaks } from '../lib/review';
import { addDays, dayRings, fairStreak, mondayOf, weekReport, type DayInput, type DayRings, type Streak, type WeekReport } from '../lib/consistency';

const REST_KEY = 'consistency_rest_day';

export function getRestDay(): boolean {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(REST_KEY) as { value: string } | undefined;
  return row?.value === '1';
}
export function setRestDay(on: boolean): boolean {
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(REST_KEY, on ? '1' : '0');
  return on;
}

/** Each day's process inputs, from the first day the journal has anything, up to `to`. */
export function dayInputs(to: string): { inputs: Map<string, DayInput>; earliest: string } {
  const { trades: all, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(all, ctxFor, cfg);
  const taken = listTrades().filter((t) => isReal(t.account) && !t.deleted_at && !t.undated && t.date && isTaken(t.outcome) && t.status !== 'Planned');
  const reviews = listDailyReviews();
  const preps = listPreps();
  const pages = new Set(journalDays());

  const inputs = new Map<string, DayInput>();
  const at = (day: string) => {
    let d = inputs.get(day);
    if (!d) { d = { day, checkedIn: false, prepSteps: 0, trades: 0, broke: 0, unfinished: 0, reviewed: pages.has(day) }; inputs.set(day, d); }
    return d;
  };
  for (const t of taken) {
    const d = at(t.date.slice(0, 10));
    d.trades += 1;
    if (planBreaks(t, breaks, cfg).length) d.broke += 1;
    if (t.quick_log || t.status === 'Live' || !t.lesson?.trim()) d.unfinished += 1;
  }
  for (const r of reviews) {
    const d = at(r.day);
    d.checkedIn = Boolean(r.checked_in_at);
    if (r.what_happened?.trim() || r.notes?.trim()) d.reviewed = true;
  }
  for (const p of preps) { const pr = prepProgress(p.data); const d = at(p.day); d.prepSteps = pr.done; d.prepComplete = pr.complete; }
  for (const day of pages) at(day);
  const days = [...inputs.keys()].filter((d) => d <= to).sort();
  return { inputs, earliest: days[0] ?? to };
}

const blank = (day: string): DayInput => ({ day, checkedIn: false, prepSteps: 0, trades: 0, broke: 0, unfinished: 0, reviewed: false });

export interface ProcessOverview { today: DayRings; days: DayRings[]; streak: Streak; restDay: boolean }

/** Today's rings, the days from `from` to `today`, and the fair streak of fully closed days. */
export function processOverview(today: string, from: string = addDays(today, -41)): ProcessOverview {
  const { inputs, earliest } = dayInputs(today);
  const ringsOf = (d: string) => dayRings(inputs.get(d) ?? blank(d));
  const restDay = getRestDay();
  const days: DayRings[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(ringsOf(d));
  const streak = fairStreak((d) => (d < earliest ? null : ringsOf(d).closed), today, { tradingOnly: true, restDay }, earliest);
  return { today: ringsOf(today), days, streak, restDay };
}

/** The Sunday report for the week starting `monday` (and the one before, to compare). */
export function consistencyWeek(monday: string, today: string): WeekReport & { streak: Streak } {
  const m = mondayOf(monday);
  const { inputs, earliest } = dayInputs(today);
  const list: DayInput[] = [];
  for (let d = addDays(m, -7); d < addDays(m, 7) && d <= today; d = addDays(d, 1)) list.push(inputs.get(d) ?? blank(d));
  const ringsOf = (d: string) => dayRings(inputs.get(d) ?? blank(d));
  const streak = fairStreak((d) => (d < earliest ? null : ringsOf(d).closed), today, { tradingOnly: true, restDay: getRestDay() }, earliest);
  return { ...weekReport(m, list), streak };
}
