import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { listTrades } from './trades';
import { matchTrips, tradePatch, type Bar, type ExecutionRow, type Fill, type RoundTrip } from '../lib/executions';

/**
 * Executions: round trips from a platform's file, kept beside the trades
 * they were. Importing the same file twice changes nothing (fingerprint);
 * linking fills in only what a trade is missing unless told otherwise; and an
 * execution with no trade is listed, never forced onto one.
 */
export type { ExecutionRow };

const hydrate = (r: Record<string, unknown>): ExecutionRow => {
  let fills: Fill[] = [];
  try { fills = JSON.parse(String(r.fills ?? '[]')) as Fill[]; } catch { /* keep none */ }
  return { ...(r as unknown as ExecutionRow), fills };
};

export function listExecutions(opts: { tradeId?: string; unlinked?: boolean; limit?: number } = {}): ExecutionRow[] {
  const where: string[] = []; const args: string[] = [];
  if (opts.tradeId) { where.push('trade_id = ?'); args.push(opts.tradeId); }
  if (opts.unlinked) where.push('trade_id IS NULL');
  const sql = `SELECT * FROM executions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY entry_at DESC LIMIT ${Math.max(1, Math.min(2000, opts.limit ?? 500))}`;
  return (getDb().prepare(sql).all(...args) as Record<string, unknown>[]).map(hydrate);
}

export function getExecution(id: string): ExecutionRow | null {
  const r = getDb().prepare('SELECT * FROM executions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? hydrate(r) : null;
}

/** Fingerprints already stored, so a preview can say "already imported". */
export function knownFingerprints(fps: string[]): Map<string, { id: string; trade_id: string | null }> {
  const out = new Map<string, { id: string; trade_id: string | null }>();
  if (!fps.length) return out;
  const rows = getDb().prepare(`SELECT id, fingerprint, trade_id FROM executions WHERE fingerprint IN (${fps.map(() => '?').join(',')})`)
    .all(...fps) as Array<{ id: string; fingerprint: string; trade_id: string | null }>;
  for (const r of rows) out.set(r.fingerprint, { id: r.id, trade_id: r.trade_id });
  return out;
}

function blockedPairs(): Set<string> {
  const rows = getDb().prepare('SELECT e.fingerprint, u.trade_id FROM execution_unlinks u JOIN executions e ON e.id = u.execution_id')
    .all() as Array<{ fingerprint: string; trade_id: string }>;
  return new Set(rows.map((r) => `${r.fingerprint}|${r.trade_id}`));
}

function linkedTradeIds(): Set<string> {
  return new Set((getDb().prepare('SELECT trade_id FROM executions WHERE trade_id IS NOT NULL').all() as Array<{ trade_id: string }>).map((r) => r.trade_id));
}

/** Suggested links for round trips not stored yet (or stored unlinked). */
export function suggestMatches(trips: Pick<RoundTrip, 'fingerprint' | 'direction' | 'instrument' | 'entryAt'>[], window: number) {
  return matchTrips(trips, listTrades(), window, blockedPairs(), linkedTradeIds());
}

export interface LinkOptions { overwrite: boolean; pnlAfterFees: boolean }

/** Fills a trade's missing fields from its execution. Never touches the outcome, R or grade. */
function patchTrade(tradeId: string, e: Pick<ExecutionRow, 'entry_price' | 'exit_price' | 'entry_at' | 'exit_at' | 'qty' | 'fees_dollars' | 'gross_dollars'>, opts: LinkOptions): string[] {
  const db = getDb();
  const t = db.prepare('SELECT entry_price, exit_price, entry_time, exit_time, contracts, fees_dollars, pnl_dollars FROM trades WHERE id = ?')
    .get(tradeId) as Parameters<typeof tradePatch>[0] | undefined;
  if (!t) return [];
  const patch = tradePatch(t, {
    entryPrice: e.entry_price, exitPrice: e.exit_price, entryAt: e.entry_at, exitAt: e.exit_at, qty: e.qty, fees: e.fees_dollars, gross: e.gross_dollars,
  }, opts);
  const cols = Object.keys(patch);
  if (!cols.length) return [];
  db.prepare(`UPDATE trades SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`)
    .run({ ...patch, id: tradeId });
  return cols;
}

/**
 * Stores round trips (skipping ones already stored) and links each to the
 * trade chosen for it (null: leave unlinked). Returns what happened.
 */
export function saveExecutions(items: Array<{ trip: RoundTrip; tradeId: string | null }>, opts: LinkOptions) {
  const db = getDb();
  const known = knownFingerprints(items.map((i) => i.trip.fingerprint));
  let added = 0; let linked = 0; let already = 0; const filled: Record<string, string[]> = {};
  const insert = db.prepare(`INSERT INTO executions (id, fingerprint, trade_id, platform, account_name, symbol, instrument, direction, qty,
    entry_price, exit_price, entry_at, exit_at, gross_dollars, fees_dollars, fills)
    VALUES (@id, @fingerprint, @trade_id, @platform, @account_name, @symbol, @instrument, @direction, @qty,
    @entry_price, @exit_price, @entry_at, @exit_at, @gross_dollars, @fees_dollars, @fills)`);
  const tradeExists = db.prepare('SELECT 1 FROM trades WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const { trip, tradeId } of items) {
      const target = tradeId && tradeExists.get(tradeId) ? tradeId : null;
      const prior = known.get(trip.fingerprint);
      let id: string;
      if (prior) {
        already += 1; id = prior.id;
        // Stored before but unlinked: a link chosen now still applies.
        if (prior.trade_id || !target) continue;
        db.prepare('UPDATE executions SET trade_id = ? WHERE id = ?').run(target, id);
      } else {
        id = crypto.randomUUID();
        insert.run({
          id, fingerprint: trip.fingerprint, trade_id: target, platform: trip.platform, account_name: trip.account, symbol: trip.symbol,
          instrument: trip.instrument, direction: trip.direction, qty: trip.qty, entry_price: trip.entryPrice, exit_price: trip.exitPrice,
          entry_at: trip.entryAt, exit_at: trip.exitAt, gross_dollars: trip.gross, fees_dollars: trip.fees, fills: JSON.stringify(trip.fills),
        });
        added += 1;
      }
      if (target) {
        linked += 1;
        const cols = patchTrade(target, {
          entry_price: trip.entryPrice, exit_price: trip.exitPrice, entry_at: trip.entryAt, exit_at: trip.exitAt, qty: trip.qty,
          fees_dollars: trip.fees, gross_dollars: trip.gross,
        }, opts);
        if (cols.length) filled[target] = cols;
      }
    }
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return { added, linked, already, filled };
}

export function linkExecution(id: string, tradeId: string, opts: LinkOptions): string[] {
  const e = getExecution(id);
  if (!e) return [];
  const db = getDb();
  db.prepare('UPDATE executions SET trade_id = NULL WHERE trade_id = ? AND id != ?').run(tradeId, id); // one execution per trade
  db.prepare('UPDATE executions SET trade_id = ? WHERE id = ?').run(tradeId, id);
  db.prepare('DELETE FROM execution_unlinks WHERE execution_id = ? AND trade_id = ?').run(id, tradeId);
  return patchTrade(tradeId, e, opts);
}

/** Unlinks by hand: the pair is remembered so auto-matching never puts it back. Trade fields already filled stay. */
export function unlinkExecution(id: string): void {
  const e = getExecution(id);
  if (!e?.trade_id) return;
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO execution_unlinks (execution_id, trade_id) VALUES (?, ?)').run(id, e.trade_id);
  db.prepare('UPDATE executions SET trade_id = NULL WHERE id = ?').run(id);
}

export function deleteExecution(id: string): void {
  getDb().prepare('DELETE FROM executions WHERE id = ?').run(id);
}

/**
 * Links stored, unlinked executions to trades logged since — the "Log it"
 * path: a trade written from an execution finds it on its own. Only when
 * auto-linking is on; returns how many were linked.
 */
export function autoLinkUnlinked(window: number, opts: LinkOptions): number {
  const loose = listExecutions({ unlinked: true, limit: 2000 });
  if (!loose.length) return 0;
  const m = suggestMatches(loose.map((e) => ({ fingerprint: e.fingerprint, direction: e.direction, instrument: e.instrument, entryAt: e.entry_at })), window);
  const byFp = new Map(loose.map((e) => [e.fingerprint, e]));
  for (const p of m) { const e = byFp.get(p.fingerprint); if (e) linkExecution(e.id, p.tradeId, opts); }
  return m.length;
}

/* ───────────── price bars ───────────── */

export function getBars(tradeId: string): { bars: Bar[]; source_name: string | null } | null {
  const r = getDb().prepare('SELECT bars, source_name FROM trade_bars WHERE trade_id = ?').get(tradeId) as { bars: string; source_name: string | null } | undefined;
  if (!r) return null;
  try { return { bars: JSON.parse(r.bars) as Bar[], source_name: r.source_name }; } catch { return null; }
}

export function saveBars(tradeId: string, bars: Bar[], sourceName: string | null): void {
  getDb().prepare(`INSERT INTO trade_bars (trade_id, bars, source_name) VALUES (?, ?, ?)
    ON CONFLICT(trade_id) DO UPDATE SET bars = excluded.bars, source_name = excluded.source_name, added_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run(tradeId, JSON.stringify(bars), sourceName);
}

export function deleteBars(tradeId: string): void {
  getDb().prepare('DELETE FROM trade_bars WHERE trade_id = ?').run(tradeId);
}

/* ───────────── backup ───────────── */

export function exportExecutions() {
  const db = getDb();
  return {
    executions: (db.prepare('SELECT * FROM executions ORDER BY entry_at').all() as Record<string, unknown>[]).map((r) => ({ ...r })),
    execution_unlinks: (db.prepare('SELECT * FROM execution_unlinks').all() as Record<string, unknown>[]).map((r) => ({ ...r })),
    trade_bars: (db.prepare('SELECT * FROM trade_bars').all() as Record<string, unknown>[]).map((r) => ({ ...r })),
  };
}

/** Restores the three tables from a backup; rows already present (by id/key) are kept as they are. */
export function restoreExecutions(body: { executions?: unknown; execution_unlinks?: unknown; trade_bars?: unknown }): number {
  const db = getDb();
  let n = 0;
  const tradeOk = db.prepare('SELECT 1 FROM trades WHERE id = ?');
  if (Array.isArray(body.executions)) {
    const put = db.prepare(`INSERT OR IGNORE INTO executions (id, fingerprint, trade_id, platform, account_name, symbol, instrument, direction, qty,
      entry_price, exit_price, entry_at, exit_at, gross_dollars, fees_dollars, fills, imported_at)
      VALUES (@id, @fingerprint, @trade_id, @platform, @account_name, @symbol, @instrument, @direction, @qty,
      @entry_price, @exit_price, @entry_at, @exit_at, @gross_dollars, @fees_dollars, @fills, @imported_at)`);
    for (const r of body.executions as Record<string, unknown>[]) {
      if (!r || typeof r.id !== 'string' || typeof r.fingerprint !== 'string' || (r.direction !== 'Long' && r.direction !== 'Short')) continue;
      try {
        const res = put.run({
          id: r.id, fingerprint: r.fingerprint, trade_id: typeof r.trade_id === 'string' && tradeOk.get(r.trade_id) ? r.trade_id : null,
          platform: String(r.platform ?? 'generic'), account_name: typeof r.account_name === 'string' ? r.account_name : null,
          symbol: String(r.symbol ?? ''), instrument: String(r.instrument ?? 'Other'), direction: r.direction, qty: Number(r.qty) || 0,
          entry_price: Number(r.entry_price) || 0, exit_price: Number(r.exit_price) || 0, entry_at: String(r.entry_at ?? ''), exit_at: String(r.exit_at ?? ''),
          gross_dollars: typeof r.gross_dollars === 'number' ? r.gross_dollars : null, fees_dollars: typeof r.fees_dollars === 'number' ? r.fees_dollars : null,
          fills: typeof r.fills === 'string' ? r.fills : '[]', imported_at: typeof r.imported_at === 'string' ? r.imported_at : new Date().toISOString(),
        });
        n += Number(res.changes);
      } catch { /* a bad row is skipped, never the restore */ }
    }
  }
  if (Array.isArray(body.execution_unlinks)) {
    const put = db.prepare('INSERT OR IGNORE INTO execution_unlinks (execution_id, trade_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM executions WHERE id = ?) AND EXISTS (SELECT 1 FROM trades WHERE id = ?)');
    for (const r of body.execution_unlinks as Record<string, unknown>[]) {
      if (r && typeof r.execution_id === 'string' && typeof r.trade_id === 'string') put.run(r.execution_id, r.trade_id, r.execution_id, r.trade_id);
    }
  }
  if (Array.isArray(body.trade_bars)) {
    const put = db.prepare('INSERT OR IGNORE INTO trade_bars (trade_id, bars, source_name, added_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM trades WHERE id = ?)');
    for (const r of body.trade_bars as Record<string, unknown>[]) {
      if (r && typeof r.trade_id === 'string' && typeof r.bars === 'string') {
        put.run(r.trade_id, r.bars, typeof r.source_name === 'string' ? r.source_name : null, typeof r.added_at === 'string' ? r.added_at : new Date().toISOString(), r.trade_id);
      }
    }
  }
  return n;
}
