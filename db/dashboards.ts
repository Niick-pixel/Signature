import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { LAYOUT_SCHEMA, migrateLayout, migrateSettings, type Migrated } from '../lib/dashboard/schema';
import type { Supports } from '../lib/dashboard/layout';
import type { Board, BoardLayout, BoardSettings, Source } from '../lib/dashboard/types';

/**
 * The Stats dashboard's boards (table dashboard_boards, migration 043).
 * Every board read back goes through lib/dashboard/schema: migrated to the
 * current schema and repaired, never thrown away. A board written by a newer
 * app is returned read-only and never saved over.
 */

export interface StoredBoard extends Board { readOnly: boolean; dropped: string[] }
interface Row { id: string; name: string; position: number; layout_json: string; settings_json: string; schema_version: number }

export interface Catalog { supports: Supports; known: (widget: string) => boolean }

const parse = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };
const now = () => new Date().toISOString();

function read(r: Row, cat: Catalog): StoredBoard {
  const m: Migrated = migrateLayout(parse(r.layout_json), r.schema_version, cat.supports, cat.known);
  return { id: r.id, name: r.name, position: r.position, layout: m.layout, settings: migrateSettings(parse(r.settings_json)), readOnly: m.readOnly, dropped: m.dropped };
}

export function listBoards(cat: Catalog): StoredBoard[] {
  return (getDb().prepare('SELECT * FROM dashboard_boards ORDER BY position, name').all() as unknown as Row[]).map((r) => read(r, cat));
}

export function getBoard(id: string, cat: Catalog): StoredBoard | null {
  const r = getDb().prepare('SELECT * FROM dashboard_boards WHERE id = ?').get(id) as unknown as Row | undefined;
  return r ? read(r, cat) : null;
}

/** Write a board as it is now. Refused for a board a newer app wrote (it would lose what this version can't read). */
export function saveBoard(b: Pick<Board, 'id' | 'name' | 'layout' | 'settings'> & { position?: number }): void {
  const db = getDb();
  const cur = db.prepare('SELECT schema_version FROM dashboard_boards WHERE id = ?').get(b.id) as { schema_version: number } | undefined;
  if (cur && cur.schema_version > LAYOUT_SCHEMA) throw new Error('This board was saved by a newer version of Signature; update the app to change it.');
  const name = b.name.trim().slice(0, 60) || 'Board';
  if (cur) {
    db.prepare('UPDATE dashboard_boards SET name = ?, layout_json = ?, settings_json = ?, schema_version = ?, updated_at = ?, position = COALESCE(?, position) WHERE id = ?')
      .run(name, JSON.stringify(b.layout), JSON.stringify(b.settings), LAYOUT_SCHEMA, now(), b.position ?? null, b.id);
  } else {
    const pos = b.position ?? ((db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM dashboard_boards').get() as { p: number }).p);
    db.prepare('INSERT INTO dashboard_boards (id, name, position, layout_json, settings_json, schema_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(b.id, name, pos, JSON.stringify(b.layout), JSON.stringify(b.settings), LAYOUT_SCHEMA, now());
  }
}

export function createBoard(name: string, layout: BoardLayout, settings: BoardSettings, id: string = crypto.randomUUID()): string {
  saveBoard({ id, name, layout, settings });
  return id;
}

export function duplicateBoard(id: string, cat: Catalog): string | null {
  const b = getBoard(id, cat);
  return b ? createBoard(`${b.name} copy`, b.layout, b.settings) : null;
}

export function renameBoard(id: string, name: string): void {
  getDb().prepare('UPDATE dashboard_boards SET name = ?, updated_at = ? WHERE id = ?').run(name.trim().slice(0, 60) || 'Board', now(), id);
}

export function deleteBoard(id: string): void {
  getDb().prepare('DELETE FROM dashboard_boards WHERE id = ?').run(id);
}

/** The boards in this order (ids not listed keep their place after these). */
export function reorderBoards(ids: readonly string[]): void {
  const db = getDb();
  const set = db.prepare('UPDATE dashboard_boards SET position = ? WHERE id = ?');
  db.exec('BEGIN');
  try { ids.forEach((id, i) => set.run(i, id)); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/**
 * The first time Stats opens (no boards yet), the defaults are written.
 * Later, "Reset board" writes one default back over its board, same id.
 */
export function seedBoards(defaults: ReadonlyArray<{ id: string; name: string; source: Source; layout: BoardLayout }>, defaultSettings: (s: Source) => BoardSettings): boolean {
  const n = (getDb().prepare('SELECT COUNT(*) AS n FROM dashboard_boards').get() as { n: number }).n;
  if (n > 0) return false;
  defaults.forEach((d, i) => saveBoard({ id: d.id, name: d.name, position: i, layout: d.layout, settings: defaultSettings(d.source) }));
  return true;
}

/** A board as a file (the ⋯ menu's Export), and back. */
export interface BoardFile { format: 'signature-board'; schema: number; name: string; layout: BoardLayout; settings: BoardSettings }
export const boardFile = (b: Board): BoardFile => ({ format: 'signature-board', schema: LAYOUT_SCHEMA, name: b.name, layout: b.layout, settings: b.settings });

/** Import: any schema this version knows, migrated and repaired; a new board, never over an existing one. */
export function importBoard(file: unknown, cat: Catalog): { id: string; dropped: string[] } {
  const f = (typeof file === 'object' && file) ? file as Partial<BoardFile> : {};
  if (f.format !== 'signature-board') throw new Error('This is not a Signature board file.');
  const schema = typeof f.schema === 'number' ? f.schema : 1;
  if (schema > LAYOUT_SCHEMA) throw new Error('This board was exported by a newer version of Signature.');
  const m = migrateLayout(f.layout, schema, cat.supports, cat.known);
  const asked = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : 'Imported board';
  // Two tabs with one name can't be told apart: an import whose name is taken says where it came from.
  const name = listBoards(cat).some((b) => b.name === asked) ? `${asked} (imported)` : asked;
  const id = createBoard(name, m.layout, migrateSettings(f.settings));
  return { id, dropped: m.dropped };
}

/**
 * Once: Stats became one board. A journal that already has boards gets the
 * new "Stats" board in front, and each board of the first version that is
 * still exactly as shipped is removed. One you changed is yours and stays.
 * Marked done in app_settings, so deleting "Stats" later is never undone.
 */
const SINGLE_KEY = 'stats_single_board';
const shape = (l: BoardLayout) => JSON.stringify([...l.tiles].sort((a, b) => a.id.localeCompare(b.id))
  .map((t) => [t.id, t.x, t.y, t.size, t.smartRotate, t.items.map((i) => [i.widget, i.cfg])]));

export function consolidateBoards(single: { id: string; name: string; source: Source; layout: BoardLayout },
  legacy: ReadonlyArray<{ id: string; layout: BoardLayout }>, cat: Catalog, defaultSettings: (s: Source) => BoardSettings): boolean {
  const db = getDb();
  if (db.prepare('SELECT 1 FROM app_settings WHERE key = ?').get(SINGLE_KEY)) return false;
  const boards = listBoards(cat);
  if (boards.length && !boards.some((b) => b.id === single.id)) {
    db.exec('BEGIN');
    try {
      saveBoard({ id: single.id, name: single.name, position: -1, layout: single.layout, settings: defaultSettings(single.source) });
      for (const l of legacy) {
        const b = boards.find((x) => x.id === l.id);
        if (b && !b.readOnly && shape(b.layout) === shape(l.layout)) deleteBoard(b.id);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(SINGLE_KEY, now());
  return true;
}
