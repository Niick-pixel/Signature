import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { deleteScreenshot } from './screenshots';
import { screenshotStillUsed } from './trades';
import type { ShotSlot } from '../lib/domain';
import type { TradeShot } from '../lib/types';

/**
 * One image is not a trade.
 *
 * The HTF frame is why you were looking, the entry is what you acted on, and
 * the result is what the market did with it. Only the first is required by the
 * capture form — the rest are optional so logging stays a ten-second job.
 */
export function shotsFor(tradeId: string): TradeShot[] {
  return getDb()
    .prepare('SELECT * FROM trade_screenshots WHERE trade_id = ? ORDER BY ordinal, rowid')
    .all(tradeId) as unknown as TradeShot[];
}

/** Shots for many trades at once, so the board is not N+1 queries. */
export function shotsForMany(ids: string[]): Map<string, TradeShot[]> {
  const out = new Map<string, TradeShot[]>();
  if (ids.length === 0) return out;
  const rows = getDb()
    .prepare(`SELECT * FROM trade_screenshots WHERE trade_id IN (${ids.map(() => '?').join(',')})
              ORDER BY ordinal, rowid`)
    .all(...ids) as unknown as TradeShot[];
  for (const row of rows) {
    const list = out.get(row.trade_id) ?? [];
    list.push(row);
    out.set(row.trade_id, list);
  }
  return out;
}

export function addShot(tradeId: string, path: string, slot: ShotSlot): TradeShot {
  const db = getDb();
  const next = (db
    .prepare('SELECT COALESCE(MAX(ordinal), -1) + 1 AS n FROM trade_screenshots WHERE trade_id = ?')
    .get(tradeId) as { n: number }).n;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO trade_screenshots (id, trade_id, path, slot, ordinal) VALUES (?, ?, ?, ?, ?)')
    .run(id, tradeId, path, slot, next);
  return { id, trade_id: tradeId, path, slot, ordinal: next };
}

/**
 * Removes one image and its file.
 *
 * The trade's own screenshot_path is the required first image and stays in
 * sync: deleting it would leave a row pointing at a file that is gone, so the
 * next remaining shot is promoted into its place instead.
 */
export function removeShot(id: string): boolean {
  const db = getDb();
  const shot = db.prepare('SELECT * FROM trade_screenshots WHERE id = ?').get(id) as
    unknown as TradeShot | undefined;
  if (!shot) return false;

  db.prepare('DELETE FROM trade_screenshots WHERE id = ?').run(id);

  const remaining = shotsFor(shot.trade_id);
  const trade = db.prepare('SELECT screenshot_path FROM trades WHERE id = ?').get(shot.trade_id) as
    { screenshot_path: string } | undefined;

  if (trade?.screenshot_path === shot.path) {
    if (remaining.length === 0) {
      // The last image cannot go: screenshot_path is NOT NULL, and a trade
      // without its chart is a record you cannot check. Put it back.
      db.prepare('INSERT INTO trade_screenshots (id, trade_id, path, slot, ordinal) VALUES (?, ?, ?, ?, ?)')
        .run(shot.id, shot.trade_id, shot.path, shot.slot, shot.ordinal);
      return false;
    }
    db.prepare('UPDATE trades SET screenshot_path = ? WHERE id = ?')
      .run(remaining[0].path, shot.trade_id);
  }

  // Only unlink once nothing references it — another gallery or another trade's main chart.
  if (!screenshotStillUsed(shot.path)) deleteScreenshot(shot.path);
  return true;
}

export function setShotSlot(id: string, slot: ShotSlot): void {
  getDb().prepare('UPDATE trade_screenshots SET slot = ? WHERE id = ?').run(slot, id);
}
