import 'server-only';
import crypto from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import { getDb } from './index';
import type { DailyReview, Playbook, RiskLimits, WeeklyReview } from '../lib/types';

const asBool = (v: unknown) => (v == null ? null : v ? 1 : 0);

/* ----------------------------------------------------------- daily review */

const DAILY_FIELDS = [
  'account', 'bias', 'bias_screenshot', 'planned_killzones', 'planned_levels',
  'what_happened', 'bias_held', 'trades_planned', 'screen_minutes', 'sleep_hours',
  'state_of_mind', 'notes', 'bias_direction', 'news', 'news_note', 'working_on',
] as const;

function hydrateDaily(row: Record<string, unknown>): DailyReview {
  return { ...row, bias_held: row.bias_held == null ? null : Boolean(row.bias_held) } as DailyReview;
}

export function getDailyReview(day: string): DailyReview | null {
  const row = getDb().prepare('SELECT * FROM daily_reviews WHERE day = ?').get(day) as
    Record<string, unknown> | undefined;
  return row ? hydrateDaily(row) : null;
}

export function listDailyReviews(): DailyReview[] {
  return (getDb().prepare('SELECT * FROM daily_reviews ORDER BY day DESC').all() as
    Record<string, unknown>[]).map(hydrateDaily);
}

/**
 * One row per day, created on first write and updated after.
 *
 * Deliberately keyed by the day rather than by an id: there is exactly one of
 * these per trading day, and a second one would just be a way to disagree with
 * myself about what happened.
 */
export function saveDailyReview(
  day: string, input: Partial<DailyReview>, opts: { checkIn?: boolean } = {},
): DailyReview {
  const db = getDb();
  const values: Record<string, SQLInputValue> = { day };
  for (const f of DAILY_FIELDS) {
    const v = (input as Record<string, unknown>)[f];
    values[f] = f === 'bias_held' ? asBool(v) : (v === undefined ? null : v as SQLInputValue);
  }
  /*
    Only what was sent is overwritten.

    The morning check-in writes five fields of a row the evening review
    fills the rest of. Updating every column would have blanked "what the
    market did" each time the morning was touched again — so a field the
    caller left out keeps whatever the row already holds.
  */
  const sent = DAILY_FIELDS.filter((f) => (input as Record<string, unknown>)[f] !== undefined);
  const sets = [
    ...sent.map((f) => `${f} = excluded.${f}`),
    // The first check-in is the one that counts: saving it again later, or
    // after the session, must not make the morning look earlier than it was.
    ...(opts.checkIn ? ['checked_in_at = COALESCE(daily_reviews.checked_in_at, excluded.checked_in_at)'] : []),
    "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  ];
  values.checked_in_at = opts.checkIn ? new Date().toISOString() : null;

  db.prepare(`
    INSERT INTO daily_reviews (day, ${DAILY_FIELDS.join(', ')}, checked_in_at)
    VALUES (@day, ${DAILY_FIELDS.map((f) => `@${f}`).join(', ')}, @checked_in_at)
    ON CONFLICT (day) DO UPDATE SET ${sets.join(', ')}
  `).run(values);

  return getDailyReview(day)!;
}

/** A restored backup keeps the moment each morning was actually written. */
/** A restored review keeps the moment it was first written. */
export function restoreReviewCreated(day: string, at: string): void {
  if (Number.isNaN(Date.parse(at))) return;
  getDb().prepare('UPDATE daily_reviews SET created_at = ? WHERE day = ?').run(at, day);
}

export function restoreCheckIn(day: string, at: string): void {
  if (Number.isNaN(Date.parse(at))) return;
  getDb().prepare('UPDATE daily_reviews SET checked_in_at = ? WHERE day = ? AND checked_in_at IS NULL')
    .run(at, day);
}

/* ---------------------------------------------------------- weekly review */

export function getWeeklyReview(weekStart: string): WeeklyReview | null {
  const row = getDb().prepare('SELECT * FROM weekly_reviews WHERE week_start = ?').get(weekStart) as
    Record<string, unknown> | undefined;
  if (!row) return null;
  let ids: string[] = [];
  try { const v = JSON.parse(String(row.reviewed_ids ?? '[]')); if (Array.isArray(v)) ids = v; } catch { /* corrupt list reads as none */ }
  return { ...row, reviewed_ids: ids } as WeeklyReview;
}

export function saveWeeklyReview(weekStart: string, summary: string, ids: string[]): WeeklyReview {
  getDb().prepare(`
    INSERT INTO weekly_reviews (week_start, summary, reviewed_ids) VALUES (?, ?, ?)
    ON CONFLICT (week_start) DO UPDATE SET summary = excluded.summary, reviewed_ids = excluded.reviewed_ids
  `).run(weekStart, summary, JSON.stringify(ids));
  return getWeeklyReview(weekStart)!;
}

export function listWeeklyReviews(): WeeklyReview[] {
  return (getDb().prepare('SELECT week_start FROM weekly_reviews ORDER BY week_start DESC').all() as
    { week_start: string }[]).map((r) => getWeeklyReview(r.week_start)!).filter(Boolean);
}

/* --------------------------------------------------------------- playbook */

export function listPlaybooks(): Playbook[] {
  return getDb()
    .prepare('SELECT * FROM playbooks WHERE archived_at IS NULL ORDER BY name')
    .all() as unknown as Playbook[];
}

export function createPlaybook(name: string, criteria: string | null, shot: string | null): Playbook {
  const id = crypto.randomUUID();
  getDb()
    .prepare('INSERT INTO playbooks (id, name, criteria, reference_screenshot) VALUES (?, ?, ?, ?)')
    .run(id, name, criteria, shot);
  return getDb().prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as unknown as Playbook;
}

export function updatePlaybook(id: string, name: string, criteria: string | null): void {
  getDb().prepare('UPDATE playbooks SET name = ?, criteria = ? WHERE id = ?').run(name, criteria, id);
}

/** Archived rather than deleted — trades still point at it. */
export function archivePlaybook(id: string): void {
  getDb()
    .prepare("UPDATE playbooks SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(id);
}

/* ------------------------------------------------------------ risk limits */

const LIMIT_KEYS = ['max_trades_per_day', 'daily_loss_limit_r', 'max_risk_per_trade_pct'] as const;

/**
 * Informational, always.
 *
 * Nothing in this app reads these to decide whether a save is allowed. They
 * drive a counter and a banner, and that is the whole contract — a journal
 * that locks me out of logging the trade that broke the limit is a journal
 * that guarantees the worst day goes unrecorded.
 */
export function getRiskLimits(): RiskLimits {
  const rows = getDb().prepare('SELECT key, value FROM app_settings').all() as
    { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  return {
    max_trades_per_day: map.get('max_trades_per_day') ?? 2,
    daily_loss_limit_r: map.get('daily_loss_limit_r') ?? 2,
    max_risk_per_trade_pct: map.get('max_risk_per_trade_pct') ?? 1,
  };
}

export function setRiskLimits(next: Partial<RiskLimits>): RiskLimits {
  const stmt = getDb().prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `);
  for (const key of LIMIT_KEYS) {
    const v = next[key];
    if (v != null && Number.isFinite(v)) stmt.run(key, String(v));
  }
  return getRiskLimits();
}
