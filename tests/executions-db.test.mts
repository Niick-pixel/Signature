/* Executions in the database: idempotent import, fill-only-empty, unlink remembered, auto-link, backup restore. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-ex-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { createTrade, getTrade } = await import('../db/trades');
const E = await import('../db/executions');
const { parseExecutions } = await import('../lib/executions');
const { parseTradeInput } = await import('../lib/validate');

const payload = (t: Record<string, unknown>) => {
  const r = parseTradeInput({
    date: '2026-10-28T09:44', instrument: 'MNQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)',
    setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'Opposing FVG',
    outcome: 'Win', r_multiple: 2, account: 'Demo', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
    screenshot_path: 'x.png', chk_returned_to_fvg: true, chk_inversion_close: true, ...t,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const opts = { platform: 'auto' as const, zone: 'journal' as const, feePerContract: 0 };
const csv = [
  'Fill Time,B/S,filledQty,avgPrice,Contract,Commission',
  '10/28/2026 09:45:10,Buy,2,21000,MNQZ6,1.24',
  '10/28/2026 09:52:40,Sell,2,21010,MNQZ6,1.24',
  '10/28/2026 11:02:00,Sell,1,21050,MNQZ6,0.62',
  '10/28/2026 11:09:00,Buy,1,21040,MNQZ6,0.62',
].join('\n');

test('import, link, fill only what is empty; the outcome and R untouched', () => {
  const a = createTrade(payload({ contracts: 1 }));
  const trips = parseExecutions(csv, opts).trips;
  const m = E.suggestMatches(trips, 10);
  assert.deepEqual(m.map((x) => x.tradeId), [a.id]);
  const r = E.saveExecutions(trips.map((trip) => ({ trip, tradeId: m.find((x) => x.fingerprint === trip.fingerprint)?.tradeId ?? null })), { overwrite: false, pnlAfterFees: true });
  assert.deepEqual([r.added, r.linked, r.already], [2, 1, 0]);
  const t = getTrade(a.id)!;
  assert.equal(t.entry_price, 21000); assert.equal(t.exit_price, 21010); assert.equal(t.entry_time, '09:45:10'); assert.equal(t.exit_time, '09:52');
  assert.equal(t.contracts, 1, 'contracts was already filled in');
  assert.equal(t.fees_dollars, 2.48); assert.equal(t.pnl_dollars, 40 - 2.48);
  assert.equal(t.outcome, 'Win'); assert.equal(t.r_multiple, 2);
  // The same file again: nothing new.
  const again = E.saveExecutions(trips.map((trip) => ({ trip, tradeId: null })), { overwrite: false, pnlAfterFees: true });
  assert.deepEqual([again.added, again.already], [0, 2]);
  assert.equal(E.listExecutions({ unlinked: true }).length, 1);
});

test('unlinking is remembered: auto-match never puts it back', () => {
  const exec = E.listExecutions().find((e) => e.trade_id)!;
  const tradeId = exec.trade_id!;
  E.unlinkExecution(exec.id);
  assert.equal(E.getExecution(exec.id)!.trade_id, null);
  assert.equal(E.autoLinkUnlinked(10, { overwrite: false, pnlAfterFees: true }), 0);
  assert.equal(E.getExecution(exec.id)!.trade_id, null);
  // Linked by hand again: allowed, and the memory cleared.
  E.linkExecution(exec.id, tradeId, { overwrite: false, pnlAfterFees: true });
  assert.equal(E.getExecution(exec.id)!.trade_id, tradeId);
});

test('Log it: a trade logged later finds its execution on its own', () => {
  const later = createTrade(payload({ date: '2026-10-28T11:01', direction: 'Short', outcome: 'Win', r_multiple: 1 }));
  assert.equal(E.autoLinkUnlinked(10, { overwrite: false, pnlAfterFees: false }), 1);
  const t = getTrade(later.id)!;
  assert.equal(t.entry_price, 21050); assert.equal(t.pnl_dollars, 20, 'gross when P&L after fees is off');
  assert.equal(E.listExecutions({ unlinked: true }).length, 0);
});

test('bars are saved, replaced and removed with their trade', () => {
  const id = E.listExecutions()[0].trade_id!;
  E.saveBars(id, [{ t: '2026-10-28T09:45:00', o: 1, h: 2, l: 0, c: 1 }], 'a.csv');
  E.saveBars(id, [{ t: '2026-10-28T09:46:00', o: 1, h: 2, l: 0, c: 1 }], 'b.csv');
  assert.equal(E.getBars(id)!.source_name, 'b.csv');
  assert.equal(E.getBars(id)!.bars.length, 1);
});

test('backup: export and restore are idempotent and keep links', () => {
  const dump = E.exportExecutions();
  assert.equal(dump.executions.length, 2);
  getDb().exec('DELETE FROM trade_bars; DELETE FROM execution_unlinks; DELETE FROM executions;');
  assert.equal(E.restoreExecutions(dump), 2);
  assert.equal(E.restoreExecutions(dump), 0, 'a second restore adds nothing');
  assert.equal(E.listExecutions().filter((e) => e.trade_id).length, 2);
  assert.equal(E.listExecutions()[0].fills.length, 2);
  assert.ok(E.getBars(dump.trade_bars[0].trade_id as string));
});
