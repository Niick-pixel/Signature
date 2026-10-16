/*
  An honest Missed log: a miss counts only if it was written down before the
  move played out. Hindsight is kept and shown, and left out of every number.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-missed-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { getTrade, listTrades } = await import('../db/trades');
const { countsInStats, isHindsight } = await import('../lib/domain');
const { missedPatterns } = await import('../lib/missed');
const { computeLayout } = await import('../lib/layout').catch(() => ({ computeLayout: null }));
const tradesRoute = await import('../app/api/trades/route');
const tradeRoute = await import('../app/api/trades/[id]/route');
getDb();

const base = {
  date: '2026-10-06T09:45', instrument: 'NQ', direction: 'Short', session: 'NY AM',
  reason: 'Hesitation (late entry)', setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium',
  target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, account: 'Missed', status: 'Settled',
  explanation: 'E'.repeat(170), lesson: 'L'.repeat(170), sweep_tier: 'major', singular_gap: true, sweep_level: 'PDH',
  chk_returned_to_fvg: true, chk_inversion_close: true,
};
async function post(t: Record<string, unknown>) {
  const fd = new FormData();
  fd.append('trade', JSON.stringify({ ...base, ...t }));
  fd.append('screenshot', new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }));
  const res = await tradesRoute.POST(new Request('http://x/api/trades', { method: 'POST', body: fd }));
  assert.equal(res.status, 201, await res.clone().text());
  return getTrade((await res.json()).id)!;
}

test('a miss written before counts; one written after is Hindsight', async () => {
  const before = await post({ written_before_outcome: true });
  const after = await post({ written_before_outcome: false });
  const never = await post({});
  assert.equal(countsInStats(before), true);
  assert.equal(isHindsight(after), true);
  assert.equal(isHindsight(never), true, 'unanswered is not shown to be honest');
  // Real trades always count.
  assert.equal(countsInStats({ account: 'Demo', written_before_outcome: null }), true);
});

test('a plan that becomes a miss was written before, whatever was ticked', async () => {
  const plan = await post({ account: 'Demo', status: 'Planned', outcome: 'Not taken', r_multiple: null });
  const fd = new FormData();
  fd.append('trade', JSON.stringify({ ...base, account: 'Missed', status: 'Settled', written_before_outcome: false }));
  const res = await tradeRoute.PUT(new Request(`http://x/api/trades/${plan.id}`, { method: 'PUT', body: fd }), { params: Promise.resolve({ id: plan.id }) });
  assert.equal(res.status, 200);
  assert.equal(getTrade(plan.id)!.written_before_outcome, true);
});

test('hindsight stays out of the hesitation figures', () => {
  const all = listTrades();
  const p = missedPatterns(all);
  // Two honest misses (the ticked one and the plan); the hindsight ones are not counted.
  assert.equal(p.missed, 2);
  assert.ok(computeLayout === null || typeof computeLayout === 'function');
});
