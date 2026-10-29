/* The prop hub through its routes: create from a preset, count trades, payouts, passed → funded, costs on the Path, backup. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-prop-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { createTrade } = await import('../db/trades');
const { listPurchases } = await import('../db/path');
const { budgetUse } = await import('../lib/path');
const D = await import('../db/prop');
const { parseTradeInput } = await import('../lib/validate');
const hub = await import('../app/api/prop/route');
const one = await import('../app/api/prop/[id]/route');
const payouts = await import('../app/api/prop/[id]/payouts/route');
const funded = await import('../app/api/prop/[id]/funded/route');
const purchases = await import('../app/api/path/purchases/route');

const trade = (t: Record<string, unknown>) => {
  const r = parseTradeInput({
    date: '2026-10-20T09:41', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)',
    setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'Opposing FVG',
    outcome: 'Win', r_multiple: 2, account: 'Eval', account_label: 'Apex-1', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
    screenshot_path: 'x.png', chk_returned_to_fvg: true, chk_inversion_close: true, ...t,
  });
  if (!r.ok) throw new Error(r.error);
  return createTrade(r.value);
};
const json = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const q = '?today=2026-10-22&boundary=calendar&warn=25';

let evalId = '';

test('an account from a preset, with its own label and start; its trades counted', async () => {
  const r = await hub.POST(json({ preset: 2, label: 'Apex-1', started_on: '2026-10-19', consistency: '50' }));
  assert.equal(r.status, 201);
  evalId = (await r.json()).account.id;
  trade({ pnl_dollars: 1600 });
  trade({ date: '2026-10-21T09:41', pnl_dollars: 1500 });
  trade({ date: '2026-10-21T10:41', pnl_dollars: 999, account_label: 'Other' }); // not this account
  trade({ date: '2026-10-18T10:41', pnl_dollars: 999 }); // before it started
  const res = await one.GET(new Request(`http://x/api/prop/${evalId}${q}`), ctx(evalId));
  const j = await res.json();
  assert.equal(j.trades.length, 2);
  assert.equal(j.standing.balance, 53100);
});

test('consistency holds the pass back until another day evens it out', async () => {
  const j = await (await one.GET(new Request(`http://x/api/prop/${evalId}${q}`), ctx(evalId))).json();
  // 1600 / 3100 = 52% > 50%: not passed yet, and it says how much more profit fixes it.
  assert.equal(j.standing.targetReached, false);
  assert.equal(j.standing.consistencyNeed, 100);
  trade({ date: '2026-10-22T09:41', pnl_dollars: 200 });
  const k = await (await one.GET(new Request(`http://x/api/prop/${evalId}${q}`), ctx(evalId))).json();
  assert.equal(k.standing.targetReached, true);
});

test('costs go through the Path: a broken promise asks why; kind and account kept; activations are not attempts', async () => {
  const body = { date: '2026-10-19', provider: 'Topstep', size: '50K', cost: 49, kind: 'eval', prop_account_id: evalId };
  const first = await purchases.POST(json(body));
  assert.equal(first.status, 409, 'the default Path promises no evals yet');
  const why = 'Testing the hub end to end with a real purchase, reason given.';
  assert.equal((await purchases.POST(json({ ...body, reason: why }))).status, 201);
  assert.equal((await purchases.POST(json({ date: '2026-10-23', provider: 'Topstep', size: '50K', cost: 149, kind: 'activation', prop_account_id: evalId, reason: why }))).status, 201);
  const ps = listPurchases();
  assert.deepEqual(ps.map((p) => p.kind).sort(), ['activation', 'eval']);
  assert.ok(ps.every((p) => p.prop_account_id === evalId));
  assert.deepEqual(budgetUse(ps), { evals: 1, dollars: 198 });
});

let fundedId = '';
test('passed → funded: the eval is marked passed and the funded account takes the firm preset', async () => {
  const r = await funded.POST(new Request('http://x', { method: 'POST' }), ctx(evalId));
  assert.equal(r.status, 201);
  const f = (await r.json()).account;
  fundedId = f.id;
  assert.equal(f.phase, 'funded'); assert.equal(f.journal_account, 'Funded'); assert.equal(f.label, 'Apex-1'); assert.equal(f.from_account_id, evalId);
  assert.equal(f.qualify_amount, 150);
  assert.equal(D.getPropAccount(evalId)!.status, 'passed');
});

test('payouts: received defaults to the split; the hub ledger nets costs against what was paid', async () => {
  const today = new Date().toLocaleDateString('en-CA');
  const r = await payouts.POST(json({ date: today, amount: 1000, status: 'paid' }), ctx(fundedId));
  assert.equal(r.status, 201);
  assert.equal((await r.json()).payout.received, 900);
  assert.equal((await payouts.POST(json({ date: today, amount: 0 }), ctx(fundedId))).status, 400);
  const h = await (await hub.GET(new Request(`http://x/api/prop?today=${today}`))).json();
  assert.deepEqual(h.ledger, { spent: 198, received: 900, net: 702 });
});

test('editing rules and status: percentages, an end date when ended, reopening clears it', async () => {
  const r = await one.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ daily_loss: '800', status: 'archived' }) }), ctx(fundedId));
  const a = (await r.json()).account;
  assert.equal(a.daily_loss, 800); assert.equal(a.status, 'archived'); assert.ok(a.ended_on);
  const b = (await (await one.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }), ctx(fundedId))).json()).account;
  assert.equal(b.ended_on, null);
});

test('backup: accounts (with the eval → funded link) and payouts restore once', () => {
  const dump = D.exportProp();
  getDb().exec('UPDATE eval_purchases SET prop_account_id = NULL; DELETE FROM prop_payouts; DELETE FROM prop_accounts;');
  assert.equal(D.restoreProp(dump), 2);
  assert.equal(D.restoreProp(dump), 0);
  assert.equal(D.getPropAccount(fundedId)!.from_account_id, evalId);
  assert.equal(D.listPayouts(fundedId).length, 1);
});
