import 'server-only';
import { getDb } from './index';

/**
 * Tables the export used to leave out entirely — so "Export everything" was
 * not a backup: the extra charts (Result, HTF, Other), board notes and links,
 * every setting (rule limits, weekly focus, news, board layout), the edit
 * history, partial exits, playbooks and dismissed flags were lost on restore.
 *
 * They are copied as they are: every column the row has and the table still
 * knows. Restoring is idempotent (a row already there is kept), except
 * settings, where the backup's value wins over a fresh journal's seeded
 * default.
 */
export const RAW_TABLES = [
  'trade_screenshots', 'board_notes', 'board_edges', 'app_settings',
  'trade_edits', 'trade_partials', 'playbooks', 'flag_dismissals',
] as const;

export function exportRawTables(): { raw_tables: Record<string, Record<string, unknown>[]> } {
  const db = getDb();
  return {
    raw_tables: Object.fromEntries(RAW_TABLES.map((t) => [t,
      (db.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[]).map((r) => ({ ...r }))])),
  };
}

export function restoreRawTables(body: { raw_tables?: unknown }): number {
  const given = body.raw_tables;
  if (!given || typeof given !== 'object') return 0;
  const db = getDb();
  let n = 0;
  for (const t of RAW_TABLES) {
    const rows = (given as Record<string, unknown>)[t];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const known = new Set((db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name));
    const verb = t === 'app_settings' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
    db.exec('BEGIN');
    try {
      for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const cols = Object.keys(r).filter((c) => known.has(c));
        if (!cols.length) continue;
        const vals = cols.map((c) => {
          const v = (r as Record<string, unknown>)[c];
          return v == null || typeof v === 'number' || typeof v === 'string' ? v ?? null : JSON.stringify(v);
        });
        try {
          n += Number(db.prepare(`${verb} INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...(vals as Array<string | number | null>)).changes);
        } catch { /* a row this journal cannot hold is skipped, never fatal */ }
      }
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  }
  return n;
}
