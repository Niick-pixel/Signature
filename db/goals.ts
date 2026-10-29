import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { listTrades } from './trades';
import { getPrep } from './prep';
import { listSessions } from './study';
import { prepProgress } from '../lib/prep';
import { goalProgress, type Goal, type GoalCheckin, type GoalKind, type GoalParams } from '../lib/goals';

/** Goals and their weekly check-ins. */
const hydrate = (r: Record<string, unknown>): Goal => {
  let params: GoalParams = {};
  try { params = JSON.parse(String(r.params ?? '{}')) as GoalParams; } catch { /* none */ }
  return { ...(r as unknown as Goal), params, archived: r.archived === 1 };
};

export function listGoals(): Goal[] {
  return (getDb().prepare('SELECT * FROM goals ORDER BY archived, created_at DESC').all() as Record<string, unknown>[]).map(hydrate);
}

export function createGoal(g: { kind: GoalKind; title: string; params: GoalParams; start_day: string; end_day: string | null }): Goal {
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO goals (id, kind, title, params, start_day, end_day) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, g.kind, g.title, JSON.stringify(g.params), g.start_day, g.end_day);
  return listGoals().find((x) => x.id === id)!;
}

export function updateGoal(id: string, patch: { title?: string; archived?: boolean; end_day?: string | null }): void {
  const db = getDb();
  if (patch.title != null) db.prepare('UPDATE goals SET title = ? WHERE id = ?').run(patch.title, id);
  if (patch.archived != null) db.prepare('UPDATE goals SET archived = ? WHERE id = ?').run(patch.archived ? 1 : 0, id);
  if (patch.end_day !== undefined) db.prepare('UPDATE goals SET end_day = ? WHERE id = ?').run(patch.end_day, id);
}

export function deleteGoal(id: string): void { getDb().prepare('DELETE FROM goals WHERE id = ?').run(id); }

export function listCheckins(): GoalCheckin[] {
  return getDb().prepare('SELECT * FROM goal_checkins ORDER BY week DESC').all() as unknown as GoalCheckin[];
}

export function saveCheckin(c: { goal_id: string; week: string; rating: number | null; note: string | null }): void {
  getDb().prepare(`INSERT INTO goal_checkins (goal_id, week, rating, note) VALUES (?, ?, ?, ?)
    ON CONFLICT(goal_id, week) DO UPDATE SET rating = excluded.rating, note = excluded.note`).run(c.goal_id, c.week, c.rating, c.note);
}

/** Every goal with its progress, worked out from the journal now. */
export function goalsWithProgress(today: string) {
  const trades = listTrades();
  const sessions = listSessions();
  const studyWeek = (monday: string) => {
    const end = new Date(`${monday}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 6);
    const sun = end.toISOString().slice(0, 10);
    return sessions.filter((s) => s.day >= monday && s.day <= sun).reduce((a, s) => a + s.minutes, 0);
  };
  const prepDone = (day: string) => { const p = getPrep(day); return p ? prepProgress(p.data).done : 0; };
  return listGoals().map((g) => ({ goal: g, progress: goalProgress(g, { trades, today, prepDone, studyWeek }) }));
}

export function exportGoals() {
  const db = getDb();
  return {
    goals: (db.prepare('SELECT * FROM goals').all() as Record<string, unknown>[]).map((r) => ({ ...r })),
    goal_checkins: (db.prepare('SELECT * FROM goal_checkins').all() as Record<string, unknown>[]).map((r) => ({ ...r })),
  };
}

export function restoreGoals(b: { goals?: unknown; goal_checkins?: unknown }): number {
  const db = getDb(); let n = 0;
  for (const r of (Array.isArray(b.goals) ? b.goals : []) as Record<string, unknown>[]) {
    if (typeof r?.id !== 'string') continue;
    try {
      n += Number(db.prepare('INSERT OR IGNORE INTO goals (id, kind, title, params, start_day, end_day, archived, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(r.id, String(r.kind), String(r.title ?? ''), String(r.params ?? '{}'), String(r.start_day), typeof r.end_day === 'string' ? r.end_day : null, r.archived ? 1 : 0, String(r.created_at ?? new Date().toISOString())).changes);
    } catch { /* skipped */ }
  }
  for (const r of (Array.isArray(b.goal_checkins) ? b.goal_checkins : []) as Record<string, unknown>[]) {
    if (typeof r?.goal_id !== 'string' || typeof r.week !== 'string') continue;
    try {
      db.prepare('INSERT OR IGNORE INTO goal_checkins (goal_id, week, rating, note, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM goals WHERE id = ?)')
        .run(r.goal_id, r.week, typeof r.rating === 'number' ? r.rating : null, typeof r.note === 'string' ? r.note : null, String(r.created_at ?? new Date().toISOString()), r.goal_id);
    } catch { /* skipped */ }
  }
  return n;
}
