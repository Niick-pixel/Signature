/* Executions imported by themselves (db/executionWatch), and Step 2 from the fills (lib/executions fillsSummary). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-watch-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');
const FOLDER = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-fills-'));

const { getDb } = await import('../db/index');
const { createTrade, getTrade } = await import('../db/trades');
const W = await import('../db/executionWatch');
const { fillsSummary } = await import('../lib/executions');
const { parseTradeInput } = await import('../lib/validate');
const { applyRules } = await import('../db/rules');

getDb();

/** A Rubric v2 trade decided at Step 1, its outcome still to write (Step 2 pending). */
const pending = () => {
  const r = parseTradeInput({
    date: '2026-10-28T09:45', instrument: 'MNQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
    htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL', outcome: 'Win', r_multiple: null, account: 'Demo', status: 'Live',
    explanation: '', lesson: '', row_sweep: 2, row_inversion: 2, row_path: 2, row_target: 1, singular_gap: true, htf_origin: '15m', plan_scenario: 'A',
    leg_location: 'Discount', planned_rr: '2', entry_method: 'On inversion close', confidence_at_entry: 4, decision: 'take',
    decided_at: '2026-10-28T14:45:21.000Z', decision_seconds: 21, decision_limit: 40, grade_override: false,
  });
  if (!r.ok) throw new Error(r.error);
  return createTrade(applyRules(r.value, null));
};

test('a folder is watched: a new file is read once, its round trip linked to the trade waiting for Step 2', () => {
  const t = pending();
  assert.equal(t.outcome_at, null, 'Step 2 still to write');
  assert.equal(W.setWatch({ folder: 'relative/path' }).ok, false);
  assert.equal(W.setWatch({ folder: FOLDER, platform: 'auto', zone: 'journal', window: 10 }).ok, true);
  assert.equal(W.scanExecutionFolder()?.files, 0, 'nothing there yet');
  fs.writeFileSync(path.join(FOLDER, 'fills.csv'), [
    'Fill Time,B/S,filledQty,avgPrice,Contract,Commission',
    '10/28/2026 09:45:10,Buy,2,21000,MNQZ6,1.24',
    '10/28/2026 09:58:40,Sell,2,21020,MNQZ6,1.24',
  ].join('\n'));
  fs.writeFileSync(path.join(FOLDER, 'notes.pdf'), 'not read');
  const last = W.scanExecutionFolder()!;
  assert.deepEqual([last.files, last.added, last.linked], [1, 1, 1]);
  const after = getTrade(t.id)!;
  assert.equal(after.contracts, 2); assert.equal(after.exit_time, '09:58');
  assert.ok(after.pnl_dollars != null && after.pnl_dollars > 0, 'P&L filled, net of fees');
  assert.equal(after.r_multiple, null, 'R is never written by the import');
  assert.equal(W.scanExecutionFolder()?.files, 0, 'an unchanged file is not read again');
});

test('Step 2 from the fills: net after fees; R from the dollars risked or the stop — never guessed', () => {
  const e = { qty: 2, exit_at: '2026-10-28T09:58:40', gross_dollars: 80, fees_dollars: 2.48, entry_price: 21000, exit_price: 21020, direction: 'Long' as const };
  assert.deepEqual(fillsSummary(e, { risk_dollars: 40, stop_loss: null }), { qty: 2, exitAt: e.exit_at, net: 77.52, r: 1.94, rFrom: 'risk', outcome: 'Win' });
  assert.equal(fillsSummary(e, { risk_dollars: null, stop_loss: 20990 }).r, 2, '20 points over a 10-point stop');
  assert.equal(fillsSummary(e, { risk_dollars: null, stop_loss: null }).r, null);
  assert.equal(fillsSummary({ ...e, gross_dollars: -40 }, { risk_dollars: null, stop_loss: null }).outcome, 'Loss');
});
