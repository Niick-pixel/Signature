import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { listTrades } from './trades';
import { STUDY_KINDS, type Quote, type StudyKind, type StudyNote, type StudySession, type VideoMark } from '../lib/study';
import { sentences } from '../lib/insights';

/** The study room: notes and playbooks with their example trades, video marks, and study time. */
const hydrate = (r: Record<string, unknown>): StudyNote => {
  let tags: string[] = [];
  try { const v = JSON.parse(String(r.tags ?? '[]')); if (Array.isArray(v)) tags = v.filter((x): x is string => typeof x === 'string'); } catch { /* none */ }
  return { ...(r as unknown as StudyNote), tags, pinned: r.pinned === 1 };
};

export function listNotes(): StudyNote[] {
  return (getDb().prepare('SELECT * FROM study_notes ORDER BY pinned DESC, updated_at DESC').all() as Record<string, unknown>[]).map(hydrate);
}

export function getNote(id: string): StudyNote | null {
  const r = getDb().prepare('SELECT * FROM study_notes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? hydrate(r) : null;
}

export interface NoteInput { kind?: StudyKind; title?: string; body?: string; url?: string | null; tags?: string[]; pinned?: boolean }

export function createNote(n: NoteInput): StudyNote {
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO study_notes (id, kind, title, body, url, tags, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, n.kind && STUDY_KINDS.includes(n.kind) ? n.kind : 'note', n.title ?? '', n.body ?? '', n.url ?? null, JSON.stringify(n.tags ?? []), n.pinned ? 1 : 0);
  return getNote(id)!;
}

export function updateNote(id: string, n: NoteInput): StudyNote | null {
  const cur = getNote(id);
  if (!cur) return null;
  getDb().prepare(`UPDATE study_notes SET kind = ?, title = ?, body = ?, url = ?, tags = ?, pinned = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(
    n.kind && STUDY_KINDS.includes(n.kind) ? n.kind : cur.kind, n.title ?? cur.title, n.body ?? cur.body,
    n.url !== undefined ? n.url : cur.url, JSON.stringify(n.tags ?? cur.tags), (n.pinned ?? cur.pinned) ? 1 : 0, id);
  return getNote(id);
}

export function deleteNote(id: string): void { getDb().prepare('DELETE FROM study_notes WHERE id = ?').run(id); }

/* ── example trades ── */

export function noteTrades(noteId: string): Array<{ trade_id: string; role: 'example' | 'counter' }> {
  return getDb().prepare('SELECT trade_id, role FROM study_note_trades WHERE note_id = ? ORDER BY added_at').all(noteId) as Array<{ trade_id: string; role: 'example' | 'counter' }>;
}

export function linkTrade(noteId: string, tradeId: string, role: 'example' | 'counter'): void {
  getDb().prepare(`INSERT INTO study_note_trades (note_id, trade_id, role) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM trades WHERE id = ?)
    ON CONFLICT(note_id, trade_id) DO UPDATE SET role = excluded.role`).run(noteId, tradeId, role, tradeId);
}

export function unlinkTrade(noteId: string, tradeId: string): void {
  getDb().prepare('DELETE FROM study_note_trades WHERE note_id = ? AND trade_id = ?').run(noteId, tradeId);
}

/** Notes a trade is an example in (for the trade page). */
export function notesForTrade(tradeId: string): Array<{ id: string; title: string; kind: StudyKind; role: string }> {
  return getDb().prepare(`SELECT n.id, n.title, n.kind, l.role FROM study_note_trades l JOIN study_notes n ON n.id = l.note_id WHERE l.trade_id = ? ORDER BY n.title`)
    .all(tradeId) as Array<{ id: string; title: string; kind: StudyKind; role: string }>;
}

/* ── video marks ── */

export function listMarks(noteId: string): VideoMark[] {
  return getDb().prepare('SELECT * FROM video_marks WHERE note_id = ? ORDER BY seconds, created_at').all(noteId) as unknown as VideoMark[];
}

export function addMark(noteId: string, seconds: number, text: string): VideoMark {
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO video_marks (id, note_id, seconds, text) VALUES (?, ?, ?, ?)').run(id, noteId, Math.max(0, Math.round(seconds)), text);
  return listMarks(noteId).find((m) => m.id === id)!;
}

export function deleteMark(id: string): void { getDb().prepare('DELETE FROM video_marks WHERE id = ?').run(id); }

/* ── study time ── */

export function listSessions(since?: string): StudySession[] {
  const db = getDb();
  return (since ? db.prepare('SELECT * FROM study_sessions WHERE day >= ? ORDER BY day, created_at').all(since) : db.prepare('SELECT * FROM study_sessions ORDER BY day, created_at').all()) as unknown as StudySession[];
}

export function addSession(s: { day: string; minutes: number; note_id: string | null; topic: string | null }): StudySession {
  const id = crypto.randomUUID();
  const note = s.note_id && getNote(s.note_id) ? s.note_id : null;
  getDb().prepare('INSERT INTO study_sessions (id, day, minutes, note_id, topic) VALUES (?, ?, ?, ?, ?)').run(id, s.day, s.minutes, note, s.topic);
  return { id, ...s, note_id: note, created_at: new Date().toISOString() };
}

export function deleteSession(id: string): void { getDb().prepare('DELETE FROM study_sessions WHERE id = ?').run(id); }

/* ── your own words, for the quote of the day ── */

/** A sentence from each lesson worth keeping (winning or breakeven trades, 30–200 characters). */
export function lessonQuotes(): Quote[] {
  const out: Quote[] = [];
  for (const t of listTrades()) {
    if (t.deleted_at || !t.lesson || t.outcome === 'Loss') continue;
    const s = sentences(t.lesson, false).find((x) => x.length >= 30 && x.length <= 200);
    if (s) out.push({ text: s, by: `You, ${t.date.slice(0, 10)}`, tradeId: t.id });
  }
  return out;
}

/* ── backup ── */

export function exportStudy() {
  const db = getDb();
  const all = (sql: string) => (db.prepare(sql).all() as Record<string, unknown>[]).map((r) => ({ ...r }));
  return {
    study_notes: all('SELECT * FROM study_notes'), study_note_trades: all('SELECT * FROM study_note_trades'),
    video_marks: all('SELECT * FROM video_marks'), study_sessions: all('SELECT * FROM study_sessions'),
  };
}

export function restoreStudy(b: { study_notes?: unknown; study_note_trades?: unknown; video_marks?: unknown; study_sessions?: unknown }): number {
  const db = getDb();
  let n = 0;
  const rows = (v: unknown) => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
  const run = (sql: string, args: unknown[]) => { try { n += Number(db.prepare(sql).run(...(args as never[])).changes); } catch { /* a bad row is skipped */ } };
  for (const r of rows(b.study_notes)) {
    if (typeof r.id !== 'string') continue;
    run('INSERT OR IGNORE INTO study_notes (id, kind, title, body, url, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [r.id, STUDY_KINDS.includes(r.kind as StudyKind) ? r.kind : 'note', String(r.title ?? ''), String(r.body ?? ''), typeof r.url === 'string' ? r.url : null,
        typeof r.tags === 'string' ? r.tags : '[]', r.pinned ? 1 : 0, String(r.created_at ?? new Date().toISOString()), String(r.updated_at ?? new Date().toISOString())]);
  }
  for (const r of rows(b.study_note_trades)) {
    if (typeof r.note_id !== 'string' || typeof r.trade_id !== 'string') continue;
    run(`INSERT OR IGNORE INTO study_note_trades (note_id, trade_id, role, added_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM study_notes WHERE id = ?) AND EXISTS (SELECT 1 FROM trades WHERE id = ?)`,
      [r.note_id, r.trade_id, r.role === 'counter' ? 'counter' : 'example', String(r.added_at ?? new Date().toISOString()), r.note_id, r.trade_id]);
  }
  for (const r of rows(b.video_marks)) {
    if (typeof r.id !== 'string' || typeof r.note_id !== 'string') continue;
    run('INSERT OR IGNORE INTO video_marks (id, note_id, seconds, text, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM study_notes WHERE id = ?)',
      [r.id, r.note_id, Math.max(0, Number(r.seconds) || 0), String(r.text ?? ''), String(r.created_at ?? new Date().toISOString()), r.note_id]);
  }
  for (const r of rows(b.study_sessions)) {
    if (typeof r.id !== 'string' || typeof r.day !== 'string' || !(Number(r.minutes) > 0)) continue;
    const note = typeof r.note_id === 'string' && getNote(r.note_id) ? r.note_id : null;
    run('INSERT OR IGNORE INTO study_sessions (id, day, minutes, note_id, topic, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [r.id, r.day, Number(r.minutes), note, typeof r.topic === 'string' ? r.topic : null, String(r.created_at ?? new Date().toISOString())]);
  }
  return n;
}
