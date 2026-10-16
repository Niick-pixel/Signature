/*
  The Path: progress measured from trades, one active step, promises held
  until their step is done — and every broken one recorded, with or without
  a reason, never refused.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-path-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { createTrade, getTrade } = await import('../db/trades');
const { syncPath, listEvents, addPurchase, setManual, listSteps } = await import('../db/path');
const { brokenBy, bannerText, heldCommitments } = await import('../lib/path');
const { parseTradeInput } = await import('../lib/validate');
const { CURRENT_RUBRIC } = await import('../lib/rubric');
const tradesRoute = await import('../app/api/trades/route');
const tradeRoute = await import('../app/api/trades/[id]/route');
const exportRoute = await import('../app/api/export/route');

getDb();

/** Enough of a ZIP reader to pull one file out of the export. */
function unzip(buf: Buffer, want: string): Buffer {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    if (name === want) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const body = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(body) : body;
    }
    at += 46 + nameLen + extra + comment;
  }
  throw new Error(`${want} not in the zip`);
}


const base = (t: Record<string, unknown> = {}) => {
  const r = parseTradeInput({
    date: '2026-10-06T09:45', instrument: 'NQ', direction: 'Short', session: 'NY AM',
    reason: 'Rules-based (A+ setup)', setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium',
    target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, account: 'Demo',
    explanation: 'E'.repeat(170), lesson: 'L'.repeat(170), screenshot_path: 'x.png',
    sweep_tier: 'major', singular_gap: true, sweep_level: 'PDH', chk_returned_to_fvg: true, chk_inversion_close: true,
    ...t,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const post = async (t: Record<string, unknown>) => {
  const fd = new FormData();
  fd.append('trade', JSON.stringify({ ...base(), ...t }));
  fd.append('screenshot', new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' }));
  const res = await tradesRoute.POST(new Request('http://x/api/trades', { method: 'POST', body: fd }));
  assert.equal(res.status, 201, await res.clone().text());
  return res.json();
};

test('the seeded path: six steps, step 1 active, the banner reads its progress', () => {
  const views = syncPath();
  assert.equal(views.length, 6);
  assert.deepEqual(views.map((v) => v.status), ['active', 'locked', 'locked', 'locked', 'locked', 'locked']);
  assert.equal(bannerText(views), 'Step 1 of 6 · Backtest sample · 0 / 50 graded before outcome');
  assert.ok(views[0].started_at, 'the active step is started');
});

test('only pre-graded backtests on the current rubric count toward step 1', () => {
  createTrade(base({ account: 'Backtest (FX Replay)', graded_post_hoc: true }));    // hindsight: no
  createTrade(base({ account: 'Demo', graded_post_hoc: false }));                    // wrong account: no
  createTrade(base({ account: 'Backtest (FX Replay)', graded_post_hoc: false, outcome: 'Not taken', r_multiple: null })); // passed: no
  createTrade(base({ account: 'Backtest (FX Replay)', graded_post_hoc: false }));    // yes
  const views = syncPath();
  assert.equal(views[0].progress[0].value, 1);
  assert.equal(views[0].progress[0].display, '1 / 50');
  assert.equal(views[0].nextAction, '49 more: FX Replay trades on the current rubric, graded before the outcome.');
});

test('promises are held until their step is done: Eval and Funded break "no paid eval"', () => {
  const views = syncPath();
  const held = heldCommitments(views).map((h) => h.commitment.id);
  assert.ok(held.includes('no-paid-eval'));
  assert.equal(brokenBy({ account: 'Eval' }, views)[0].commitment.id, 'no-paid-eval');
  assert.equal(brokenBy({ account: 'Funded' }, views).length, 1);
  assert.equal(brokenBy({ account: 'Demo' }, views).length, 0);
  assert.equal(brokenBy({ purchase: { cost: 150 } }, views)[0].commitment.id, 'no-paid-eval');
});

test('an Eval trade with a reason carries it, and the Path records it', async () => {
  const reason = 'The demo account expired and the firm only offers a paid retry this week.';
  const created = await post({
    account: 'Eval',
    overrides: [{ kind: 'commitment_break', step_id: 'demo-eval', step_title: 'Demo eval', commitment_id: 'no-paid-eval',
      commitment_text: 'No paid eval until the demo evaluation is passed.', reason, at: '2026-10-16T10:00:00.000Z' }],
  });
  const t = getTrade(created.id)!;
  assert.equal(t.overrides.length, 1);
  assert.equal(t.overrides[0].reason, reason);
  const ev = listEvents().find((e) => e.trade_id === t.id);
  assert.equal(ev?.kind, 'commitment_break');
  assert.equal(ev?.reason, reason);
});

test('an Eval trade without one is still recorded — never refused, never silent', async () => {
  const created = await post({ account: 'Eval' });
  const t = getTrade(created.id)!;
  assert.equal(t.overrides.length, 1);
  assert.equal(t.overrides[0].reason, null);
  assert.ok(listEvents().some((e) => e.trade_id === t.id && e.reason === null));

  // Editing it without changing the account asks nothing new.
  const before = listEvents().length;
  const fd = new FormData();
  fd.append('trade', JSON.stringify({ ...base(), account: 'Eval', overrides: t.overrides, lesson: 'M'.repeat(170) }));
  const res = await tradeRoute.PUT(new Request(`http://x/api/trades/${t.id}`, { method: 'PUT', body: fd }), { params: Promise.resolve({ id: t.id }) });
  assert.equal(res.status, 200);
  assert.equal(listEvents().length, before);
  assert.equal(getTrade(t.id)!.overrides.length, 1);
});

test('an eval purchase needs a reason while the promise holds', () => {
  const refused = addPurchase({ date: '2026-10-16', provider: 'LucidPro', size: '25K', cost: 150, note: null }, null);
  assert.equal(refused.ok, false);
  const ok = addPurchase({ date: '2026-10-16', provider: 'LucidPro', size: '25K', cost: 150, note: null },
    'Buying it now to lock the discount; I will not start it until the demo is passed.');
  assert.equal(ok.ok, true);
  assert.ok(listEvents().some((e) => e.eval_purchase_id && e.commitment_id === 'no-paid-eval'));
});

test('a step completes itself when every criterion is met, and the next one starts', () => {
  for (let i = 0; i < 49; i++) createTrade(base({ account: 'Backtest (FX Replay)', graded_post_hoc: false, r_multiple: i % 2 ? 2 : -1, outcome: i % 2 ? 'Win' : 'Loss' }));
  const views = syncPath();
  assert.equal(views[0].status, 'done');
  assert.equal(views[1].status, 'active');
  assert.ok(listEvents().some((e) => e.kind === 'step_done' && e.step_id === 'backtest-sample'));
  // Step 2 needs the review page confirmed by hand — with a note.
  assert.equal(views[1].complete, false);
  assert.equal(setManual('backtest-review', 'page', { done: true, note: null, proof_path: null }).ok, false);
  assert.equal(setManual('backtest-review', 'page', { done: true, note: 'Written 16 Oct.', proof_path: null }).ok, true);
  const after = syncPath();
  assert.equal(after[1].status, 'done', JSON.stringify(after[1].progress));
  assert.equal(after[2].status, 'active');
  assert.equal(CURRENT_RUBRIC, listSteps()[0].criteria[0].filter?.rubric === 'current' ? CURRENT_RUBRIC : -1);
});

test('the export carries the Path, at version 6, and overrides in every format', async () => {
  const res = await exportRoute.GET();
  const buf = Buffer.from(await res.arrayBuffer());
  const json = JSON.parse(unzip(buf, 'trades.json').toString('utf8'));
  assert.equal(json.version, 7);
  assert.equal(json.path_steps.length, 6);
  assert.ok(json.path_events.length > 0);
  assert.equal(json.eval_purchases.length, 1);
  assert.ok(json.trades.some((t: { overrides: unknown[] }) => t.overrides.length === 1));
  const csv = unzip(buf, 'trades.csv').toString('utf8');
  const head = csv.split('\n')[0].split(',');
  for (const c of ['overrides', 'grade_locked_at', 'chart_date', 'nearest_liquidity_type', 'r_to_nearest', 'target_check_passed', 'eqhl_checks', 'be_trigger', 'below_min_confidence']) {
    assert.ok(head.includes(c), c);
  }
  assert.ok(csv.includes('commitment_break: No paid eval until the demo evaluation is passed.'));
});

test('lists come back as plain objects (React will not serialise null-prototype rows)', async () => {
  const { listPurchases } = await import('../db/path');
  for (const row of [...listEvents(), ...listPurchases()]) assert.equal(Object.getPrototypeOf(row), Object.prototype);
});
