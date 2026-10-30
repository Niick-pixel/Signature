import 'server-only';
import { getDb } from './index';
import { offsetSlot, type GroupMode } from '../lib/layout';
import type { BoardEdge, BoardNote } from '../lib/types';

const KEY = 'cluster_offsets';

/**
 * Where each group has been dragged to, relative to where the grid put it.
 *
 * Cards are placed entirely by the layout now, so their own coordinates are no
 * longer written — but dragging a whole group somewhere meaningful still is.
 * Storing an OFFSET rather than an absolute position means the arrangement
 * survives a group growing, shrinking, or being re-sorted: the grid moves the
 * group and your nudge moves with it.
 *
 * Keyed by grouping mode too, because "where I put the Revenge pile" is a fact
 * about the board organised by reason and means nothing when it is organised by
 * month.
 */
export type ClusterOffsets = Record<string, { dx: number; dy: number }>;


export function readOffsets(): ClusterOffsets {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(KEY) as
    { value: string } | undefined;
  if (!row) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' ? (parsed as ClusterOffsets) : {};
  } catch {
    // A corrupt blob must not take the board down; a lost nudge is recoverable.
    return {};
  }
}

export function writeOffset(mode: GroupMode, key: string, dx: number, dy: number, account = 'All'): void {
  const all = readOffsets();
  if (dx === 0 && dy === 0) delete all[offsetSlot(mode, key, account)];
  else all[offsetSlot(mode, key, account)] = { dx, dy };
  getDb()
    .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(KEY, JSON.stringify(all));
}

export function clearOffsets(): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(KEY);
}

/**
 * Everything the board needs besides the trades, read on the server so the
 * page arrives complete — the board is drawn once, not redrawn as each piece
 * comes in over the network.
 */
export function boardStart(): { notes: BoardNote[]; edges: BoardEdge[]; offsets: ClusterOffsets } {
  const db = getDb();
  // Plain objects: node:sqlite rows have a null prototype, which React refuses
  // to hand to a client component — one board note took down every screen.
  const plain = <T,>(rows: unknown[]) => rows.map((r) => ({ ...(r as object) })) as T[];
  return {
    notes: plain<BoardNote>(db.prepare('SELECT * FROM board_notes ORDER BY created_at').all()),
    edges: plain<BoardEdge>(db.prepare('SELECT * FROM board_edges ORDER BY created_at').all()),
    offsets: readOffsets(),
  };
}
