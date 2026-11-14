import 'server-only';
import { getDb } from './index';
import type { StudySession } from '../lib/study';

/*
  Time in the app (051): seconds per local day while the window is focused, or
  full screen on a monitor, and not idle (components/shell/AppTimeTracker).
*/

/** The most one heartbeat can add: the tracker reports every 30 s, so anything bigger is a clock jump. */
const MAX_BEAT = 120;

export function addAppTime(day: string, seconds: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('The day is YYYY-MM-DD.');
  const s = Math.max(0, Math.min(MAX_BEAT, Number(seconds) || 0));
  if (s > 0) {
    getDb().prepare(`INSERT INTO app_time (day, seconds) VALUES (?, ?)
      ON CONFLICT(day) DO UPDATE SET seconds = seconds + excluded.seconds, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(day, s);
  }
  return appTimeOn(day);
}

export function appTimeOn(day: string): number {
  return (getDb().prepare('SELECT seconds FROM app_time WHERE day = ?').get(day) as { seconds: number } | undefined)?.seconds ?? 0;
}

export function listAppTime(): Array<{ day: string; seconds: number }> {
  return getDb().prepare('SELECT day, seconds FROM app_time ORDER BY day').all() as Array<{ day: string; seconds: number }>;
}

/**
 * Study sessions with the app's time filled in: a day with no session logged
 * by hand counts its time in the app (a whole minute or more) as one block,
 * "Time in the app". A day you logged yourself keeps only what you logged —
 * never both, so nothing is counted twice.
 */
export function withAppTime<T extends Pick<StudySession, 'day' | 'minutes'>>(sessions: readonly T[]): Array<T | (Pick<StudySession, 'day' | 'minutes' | 'id' | 'topic' | 'created_at'> & { auto: true })> {
  const manual = new Set(sessions.map((s) => s.day));
  const auto = listAppTime().filter((a) => !manual.has(a.day) && a.seconds >= 60)
    .map((a) => ({ id: `app:${a.day}`, day: a.day, minutes: Math.round(a.seconds / 6) / 10, topic: 'Time in the app', created_at: `${a.day}T23:59:00.000Z`, auto: true as const }));
  return [...sessions, ...auto].sort((a, b) => a.day.localeCompare(b.day));
}
