import 'server-only';
import { getDb } from './index';
import { mondayOf, parsePrepData, type PrepData, type SessionPrep } from '../lib/prep';

function hydrate(row: Record<string, unknown>): SessionPrep {
  let data: unknown = {};
  // A damaged document reads as an empty prep, never as an unreadable day.
  try { data = JSON.parse(String(row.data ?? '{}')); } catch { /* empty */ }
  return {
    day: String(row.day),
    data: parsePrepData(data),
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    updated_at: String(row.updated_at),
  };
}

export function getPrep(day: string): SessionPrep | null {
  const row = getDb().prepare('SELECT * FROM session_prep WHERE day = ?').get(day) as Record<string, unknown> | undefined;
  return row ? hydrate(row) : null;
}

/** The most recent prep before `day` — where yesterday's levels come from. */
export function previousPrep(day: string): SessionPrep | null {
  const row = getDb().prepare('SELECT * FROM session_prep WHERE day < ? ORDER BY day DESC LIMIT 1').get(day) as
    Record<string, unknown> | undefined;
  return row ? hydrate(row) : null;
}

/** Preps from the Monday of `day`'s week up to the day before it. */
export function weekPrepsBefore(day: string): SessionPrep[] {
  return (getDb().prepare('SELECT * FROM session_prep WHERE day >= ? AND day < ? ORDER BY day').all(mondayOf(day), day) as
    Record<string, unknown>[]).map(hydrate);
}

export function listPreps(): SessionPrep[] {
  return (getDb().prepare('SELECT * FROM session_prep ORDER BY day').all() as Record<string, unknown>[]).map(hydrate);
}

/**
 * Saves the day's prep. started_at is set by the first save and kept;
 * completed_at is set the first time it is finished and kept too.
 */
export function savePrep(day: string, data: PrepData, complete = false): SessionPrep {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO session_prep (day, data, started_at, completed_at, updated_at)
    VALUES (@day, @data, @now, @done, @now)
    ON CONFLICT (day) DO UPDATE SET
      data = excluded.data,
      started_at = COALESCE(session_prep.started_at, excluded.started_at),
      completed_at = COALESCE(session_prep.completed_at, excluded.completed_at),
      updated_at = excluded.updated_at
  `).run({ day, data: JSON.stringify(data), now, done: complete ? now : null });
  return getPrep(day)!;
}

/** The restore path: the prep exactly as exported, timestamps and all. */
export function restorePrep(prep: { day: string; data: PrepData; started_at: string | null; completed_at: string | null }): void {
  getDb().prepare(`
    INSERT INTO session_prep (day, data, started_at, completed_at)
    VALUES (@day, @data, @started_at, @completed_at)
  `).run({ day: prep.day, data: JSON.stringify(prep.data), started_at: prep.started_at, completed_at: prep.completed_at });
}
