import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';

/** The Edge Engine's own tables (037): your theme words, the insight ledger, blind grades. */

/* ── theme dictionary ── */
export interface ThemeWord { id: string; theme: string; phrase: string }
export function listThemeWords(): ThemeWord[] {
  return getDb().prepare('SELECT id, theme, phrase FROM theme_dictionary ORDER BY theme, phrase').all() as unknown as ThemeWord[];
}
export function addThemeWord(theme: string, phrase: string): string | null {
  const id = crypto.randomUUID();
  const r = getDb().prepare('INSERT OR IGNORE INTO theme_dictionary (id, theme, phrase) VALUES (?, ?, ?)').run(id, theme, phrase);
  return Number(r.changes) ? id : null;
}
export function deleteThemeWord(id: string): void { getDb().prepare('DELETE FROM theme_dictionary WHERE id = ?').run(id); }

/* ── insight ledger ── */
export interface InsightRow {
  id: string; created_at: string; scope: string; kind: string; field: string; level: string; direction: 'positive' | 'negative';
  size: number; verdict: string; n_at: number; last_trade_at: string; status: 'open' | 'held' | 'faded' | 'reversed';
  evaluated_at: string | null; eval_n: number | null; eval_size: number | null; eval_p: number | null;
}
export function listInsights(): InsightRow[] {
  return getDb().prepare('SELECT * FROM insights ORDER BY created_at').all() as unknown as InsightRow[];
}
export function addInsight(i: Pick<InsightRow, 'scope' | 'kind' | 'field' | 'level' | 'direction' | 'size' | 'verdict' | 'n_at' | 'last_trade_at'>): string {
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO insights (id, scope, kind, field, level, direction, size, verdict, n_at, last_trade_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, i.scope, i.kind, i.field, i.level, i.direction, i.size, i.verdict, i.n_at, i.last_trade_at);
  return id;
}
export function settleInsight(id: string, r: { status: InsightRow['status']; eval_n: number; eval_size: number; eval_p: number }): void {
  getDb().prepare("UPDATE insights SET status = ?, eval_n = ?, eval_size = ?, eval_p = ?, evaluated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(r.status, r.eval_n, r.eval_size, r.eval_p, id);
}

/* ── blind grades ── */
export interface BlindRow { id: string; trade_id: string; created_at: string; grade: string; score: number | null }
export function listBlindGrades(): BlindRow[] {
  return getDb().prepare('SELECT * FROM blind_grades ORDER BY created_at').all() as unknown as BlindRow[];
}
/** Stores the blind grade, and puts the latest one on the trade (blind_grade). */
export function addBlindGrade(tradeId: string, grade: string, score: number | null): string {
  const db = getDb(); const id = crypto.randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO blind_grades (id, trade_id, grade, score) VALUES (?, ?, ?, ?)').run(id, tradeId, grade, score);
    // Not an edit by you: "last edited" is left alone. The touch trigger is lifted for this one write
    // and recreated from its own stored definition, inside the same transaction.
    const trig = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'trades_touch_updated_at'").get() as { sql: string } | undefined;
    if (trig) db.exec('DROP TRIGGER trades_touch_updated_at');
    db.prepare('UPDATE trades SET blind_grade = ? WHERE id = ?').run(grade, tradeId);
    if (trig) db.exec(trig.sql);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return id;
}

/* ── backup ── */
export function exportEdge() {
  const all = (t: string) => (getDb().prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[]).map((r) => ({ ...r }));
  return { themeDictionary: all('theme_dictionary'), insights: all('insights'), blindGrades: all('blind_grades') };
}
export function restoreEdge(b: { themeDictionary?: unknown; insights?: unknown; blindGrades?: unknown }): number {
  const db = getDb(); let n = 0;
  const rows = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  const str = (v: unknown) => (typeof v === 'string' ? v : null); const num = (v: unknown) => (typeof v === 'number' ? v : null);
  for (const r of rows(b.themeDictionary)) if (str(r.id) && str(r.theme) && str(r.phrase))
    try { n += Number(db.prepare('INSERT OR IGNORE INTO theme_dictionary (id, theme, phrase, created_at) VALUES (?, ?, ?, ?)').run(r.id as string, r.theme as string, r.phrase as string, str(r.created_at) ?? new Date().toISOString()).changes); } catch { /* skipped */ }
  for (const r of rows(b.insights)) if (str(r.id) && str(r.scope) && (r.direction === 'positive' || r.direction === 'negative'))
    try {
      n += Number(db.prepare('INSERT OR IGNORE INTO insights (id, created_at, scope, kind, field, level, direction, size, verdict, n_at, last_trade_at, status, evaluated_at, eval_n, eval_size, eval_p) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(r.id as string, str(r.created_at) ?? new Date().toISOString(), r.scope as string, str(r.kind) ?? 'anatomy', str(r.field) ?? '', str(r.level) ?? '', r.direction as string, num(r.size) ?? 0, str(r.verdict) ?? 'hint',
          num(r.n_at) ?? 0, str(r.last_trade_at) ?? '', ['open', 'held', 'faded', 'reversed'].includes(String(r.status)) ? String(r.status) : 'open', str(r.evaluated_at), num(r.eval_n), num(r.eval_size), num(r.eval_p)).changes);
    } catch { /* skipped */ }
  for (const r of rows(b.blindGrades)) if (str(r.id) && str(r.trade_id) && str(r.grade))
    try { n += Number(db.prepare('INSERT OR IGNORE INTO blind_grades (id, trade_id, created_at, grade, score) VALUES (?, ?, ?, ?, ?)').run(r.id as string, r.trade_id as string, str(r.created_at) ?? new Date().toISOString(), r.grade as string, num(r.score)).changes); } catch { /* skipped */ }
  return n;
}
