import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { BACKTEST } from '../lib/domain';
import { emptyContext, emptyScenarios, weekdayOf, type DayOutcome, type ReplayContext, type ReplayDay, type ReplayScenarios, type Took } from '../lib/replay';

/*
  Replay days (048). A day is created already locked ("Lock & play"); its
  plan is never rewritten after that. An amendment is stored beside the
  original and flags the day. Days are numbered within a sitting: a sitting
  ends when a day is closed with "end the sitting", or by itself when the
  next plan is made on a later calendar date.
*/

const json = <T,>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string') return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
};
const read = (r: Record<string, unknown>): ReplayDay => ({
  id: r.id as string, sitting_id: r.sitting_id as string, sequence: r.sequence as number, replay_date: r.replay_date as string,
  weekday: (r.weekday as string | null) ?? null, instrument: (r.instrument as string | null) ?? null,
  // A day planned before the taken levels were asked reads with taken: null (not answered).
  context: { ...emptyContext(), ...json(r.context, emptyContext()) }, scenarios: json(r.scenarios, emptyScenarios()),
  locked_at: (r.locked_at as string | null) ?? null, amended_at: (r.amended_at as string | null) ?? null,
  amended_context: r.amended_context ? { ...emptyContext(), ...json(r.amended_context, emptyContext()) } : null,
  amended_scenarios: r.amended_scenarios ? json(r.amended_scenarios, null) : null,
  outcome: (r.outcome as DayOutcome | null) ?? null, took_a: (r.took_a as Took | null) ?? null, took_b: (r.took_b as Took | null) ?? null,
  closed_at: (r.closed_at as string | null) ?? null, ends_sitting: r.ends_sitting === 1, created_at: r.created_at as string,
});
const now = () => new Date().toISOString();
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function listReplayDays(): ReplayDay[] {
  return (getDb().prepare('SELECT * FROM replay_days ORDER BY created_at').all() as Record<string, unknown>[]).map(read);
}
export function getReplayDay(id: string): ReplayDay | null {
  const r = getDb().prepare('SELECT * FROM replay_days WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? read(r) : null;
}
/** The day being traded: the newest one, while it is locked and not closed. */
export function activeReplayDay(): ReplayDay | null {
  const last = listReplayDays().pop() ?? null;
  return last && last.locked_at && !last.closed_at ? last : null;
}
export function lastReplayDay(): ReplayDay | null {
  return listReplayDays().pop() ?? null;
}

/** "Lock & play": the plan, saved and locked in one step. Closes an open previous day without an outcome only if asked to. */
export function lockReplayDay(input: { replay_date: string; instrument: string | null; context: ReplayContext; scenarios: ReplayScenarios; at?: string }): ReplayDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.replay_date)) throw new Error('The replay date is YYYY-MM-DD.');
  const at = input.at ?? now();
  const last = lastReplayDay();
  if (last && last.locked_at && !last.closed_at) throw new Error('Close the current replay day first ("Next replay day").');
  // Same sitting: the last day did not end it, and it was planned on the same calendar day.
  const same = last && !last.ends_sitting && localDay(last.created_at) === localDay(at);
  const sitting = same ? last!.sitting_id : crypto.randomUUID();
  const sequence = same ? last!.sequence + 1 : 1;
  const id = crypto.randomUUID();
  getDb().prepare(`INSERT INTO replay_days (id, sitting_id, sequence, replay_date, weekday, instrument, context, scenarios, locked_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, sitting, sequence, input.replay_date, weekdayOf(input.replay_date), input.instrument,
    JSON.stringify(input.context), JSON.stringify(input.scenarios), at, at);
  return getReplayDay(id)!;
}

/** "Amend": the new plan is kept beside the locked original, and the day is flagged amended everywhere. */
export function amendReplayDay(id: string, context: ReplayContext, scenarios: ReplayScenarios): ReplayDay {
  const d = getReplayDay(id);
  if (!d) throw new Error('No such replay day.');
  getDb().prepare('UPDATE replay_days SET amended_at = ?, amended_context = ?, amended_scenarios = ? WHERE id = ?')
    .run(now(), JSON.stringify(context), JSON.stringify(scenarios), id);
  return getReplayDay(id)!;
}

/**
 * A wrong replay date, put right: the day moves, and its trades move with it
 * (same time of day; each change in the trade's edit log). The plan is not
 * touched, so the day is not flagged amended.
 */
export function redateReplayDay(id: string, replayDate: string): ReplayDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(replayDate)) throw new Error('The replay date is YYYY-MM-DD.');
  const d = getReplayDay(id);
  if (!d) throw new Error('No such replay day.');
  if (d.replay_date === replayDate) return d;
  const db = getDb();
  db.prepare('UPDATE replay_days SET replay_date = ?, weekday = ? WHERE id = ?').run(replayDate, weekdayOf(replayDate), id);
  const log = db.prepare('INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, ?, ?, ?)');
  for (const t of db.prepare('SELECT id, date FROM trades WHERE replay_day_id = ?').all(id) as Array<{ id: string; date: string }>) {
    const next = `${replayDate}${t.date.slice(10)}`;
    db.prepare('UPDATE trades SET date = ? WHERE id = ?').run(next, t.id);
    log.run(t.id, 'date', t.date, next);
  }
  return getReplayDay(id)!;
}

/**
 * Backtests logged before replay days existed carry the day they were logged.
 * Grouped by that day, a group is moved at once to the day it replayed (same
 * time of day, each change in the trade's edit log).
 */
export function looseBacktestDays(): Array<{ day: string; count: number }> {
  return getDb().prepare(`SELECT substr(date, 1, 10) AS day, count(*) AS count FROM trades
    WHERE account = ? AND replay_day_id IS NULL AND deleted_at IS NULL GROUP BY day ORDER BY day`).all(BACKTEST) as Array<{ day: string; count: number }>;
}
export function redateLooseBacktests(moves: ReadonlyArray<{ from: string; to: string }>): number {
  if (!moves.every((m) => [m.from, m.to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))) throw new Error('The dates are YYYY-MM-DD.');
  const db = getDb();
  const pick = db.prepare('SELECT id, date FROM trades WHERE account = ? AND replay_day_id IS NULL AND deleted_at IS NULL AND substr(date, 1, 10) = ?');
  // Every group's trades are picked before any moves: a group landing on another group's day never drags it along.
  const plan = moves.flatMap((m) => (pick.all(BACKTEST, m.from) as Array<{ id: string; date: string }>).map((t) => ({ ...t, to: m.to })));
  const log = db.prepare('INSERT INTO trade_edits (trade_id, field, old_value, new_value) VALUES (?, ?, ?, ?)');
  const set = db.prepare('UPDATE trades SET date = ?, undated = 0 WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const t of plan) { const next = `${t.to}${t.date.slice(10)}`; set.run(next, t.id); log.run(t.id, 'date', t.date, next); }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return plan.length;
}

/** "Next replay day" or ending the sitting: what played out, and whether each played scenario was taken. */
export function closeReplayDay(id: string, o: { outcome: DayOutcome; took_a: Took | null; took_b: Took | null; ends_sitting: boolean }): ReplayDay {
  const d = getReplayDay(id);
  if (!d) throw new Error('No such replay day.');
  getDb().prepare('UPDATE replay_days SET outcome = ?, took_a = ?, took_b = ?, ends_sitting = ?, closed_at = ? WHERE id = ?')
    .run(o.outcome, o.took_a, o.took_b, o.ends_sitting ? 1 : 0, now(), id);
  return getReplayDay(id)!;
}
