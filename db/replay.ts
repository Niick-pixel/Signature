import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
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
  context: json(r.context, emptyContext()), scenarios: json(r.scenarios, emptyScenarios()),
  locked_at: (r.locked_at as string | null) ?? null, amended_at: (r.amended_at as string | null) ?? null,
  amended_context: r.amended_context ? json(r.amended_context, null) : null,
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

/** "Next replay day" or ending the sitting: what played out, and whether each played scenario was taken. */
export function closeReplayDay(id: string, o: { outcome: DayOutcome; took_a: Took | null; took_b: Took | null; ends_sitting: boolean }): ReplayDay {
  const d = getReplayDay(id);
  if (!d) throw new Error('No such replay day.');
  getDb().prepare('UPDATE replay_days SET outcome = ?, took_a = ?, took_b = ?, ends_sitting = ?, closed_at = ? WHERE id = ?')
    .run(o.outcome, o.took_a, o.took_b, o.ends_sitting ? 1 : 0, now(), id);
  return getReplayDay(id)!;
}
