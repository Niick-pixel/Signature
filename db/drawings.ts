import 'server-only';
import { getDb } from './index';

/** Drawings on screenshots (feature 7), by the screenshot's path. */
export interface Drawing { items: unknown[]; r: number | null }

export function getDrawing(path: string): Drawing | null {
  const r = getDb().prepare('SELECT data FROM shot_drawings WHERE path = ?').get(path) as { data: string } | undefined;
  if (!r) return null;
  try { return JSON.parse(r.data) as Drawing; } catch { return null; }
}

export function drawingsFor(paths: string[]): Record<string, Drawing> {
  const out: Record<string, Drawing> = {};
  if (!paths.length) return out;
  const rows = getDb().prepare(`SELECT path, data FROM shot_drawings WHERE path IN (${paths.map(() => '?').join(',')})`).all(...paths) as Array<{ path: string; data: string }>;
  for (const r of rows) { try { out[r.path] = JSON.parse(r.data) as Drawing; } catch { /* skipped */ } }
  return out;
}

export function saveDrawing(path: string, d: Drawing): void {
  if (!d.items.length) { getDb().prepare('DELETE FROM shot_drawings WHERE path = ?').run(path); return; }
  getDb().prepare(`INSERT INTO shot_drawings (path, data) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run(path, JSON.stringify(d));
}

export function exportDrawings() {
  return { shot_drawings: (getDb().prepare('SELECT * FROM shot_drawings').all() as Record<string, unknown>[]).map((r) => ({ ...r })) };
}

export function restoreDrawings(b: { shot_drawings?: unknown }): number {
  let n = 0;
  for (const r of (Array.isArray(b.shot_drawings) ? b.shot_drawings : []) as Record<string, unknown>[]) {
    if (typeof r?.path !== 'string' || typeof r.data !== 'string') continue;
    try { n += Number(getDb().prepare('INSERT OR IGNORE INTO shot_drawings (path, data, updated_at) VALUES (?, ?, ?)').run(r.path, r.data, String(r.updated_at ?? new Date().toISOString())).changes); } catch { /* skipped */ }
  }
  return n;
}
