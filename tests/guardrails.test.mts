/*
  New Trade guardrails: grades locked before the outcome, confidence below
  the minimum tagged as a rule break, the target check, the day's loss limit.
  Nothing here ever refuses a trade — it records.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-guard-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { getTrade } = await import('../db/trades');
const { syncPath } = await import('../db/path');
const { guardContext, dayLimit } = await import('../db/rules');
const { savePrep } = await import('../db/prep');
const { parsePrepData } = await import('../lib/prep');
const { adherenceOf } = await import('../lib/adherence');
const { targetCheck, rToNearest } = await import('../lib/targetCheck');
const { stopAfterFor, DEFAULT_RULES } = await import('../lib/rules');
const tradesRoute = await import('../app/api/trades/route');
const tradeRoute = await import('../app/api/trades/[id]/route');
const settleRoute = await import('../app/api/trades/[id]/settle/route');

getDb();

const base = {
  date: '2026-10-06T09:45', instrument: 'NQ', direction: 'Short', session: 'NY AM',
  reason: 'Rules-based (A+ setup)', setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium',
  target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, account: 'Demo', status: 'Settled',
  explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
  sweep_tier: 'major', singular_gap: true, sweep_level: 'PDH', chk_returned_to_fvg: true, chk_inversion_close: true,
  chk_htf_bias: true, chk_killzone: true, chk_no_news: true, chk_displacement_fvg: true, chk_targets_clear: true, chk_clean_path: true,
  confidence_at_entry: 4,
};

async function post(t: Record<string, unknown>) {
  const fd = new FormData();
  fd.append('trade', JSON.stringify({ ...base, ...t }));
  fd.append('screenshot', new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' }));
  const res = await tradesRoute.POST(new Request('http://x/api/trades', { method: 'POST', body: fd }));
  assert.equal(res.status, 201, await res.clone().text());
  return getTrade((await res.json()).id)!;
}
async function put(id: string, t: Record<string, unknown>) {
  const fd = new FormData();
  fd.append('trade', JSON.stringify({ ...base, ...t }));
  const res = await tradeRoute.PUT(new Request(`http://x/api/trades/${id}`, { method: 'PUT', body: fd }), { params: Promise.resolve({ id }) });
  assert.equal(res.status, 200, await res.clone().text());
  return getTrade(id)!;
}

test('a trade saved Settled is graded after the fact; Planned or Live, before — the server decides', async () => {
  const settled = await post({ graded_post_hoc: false });
  assert.equal(settled.graded_post_hoc, true);
  assert.ok(settled.grade_locked_at);
  const planned = await post({ status: 'Planned', outcome: 'Not taken', r_multiple: null, graded_post_hoc: true });
  assert.equal(planned.graded_post_hoc, false);
  const live = await post({ status: 'Live', outcome: 'Not taken', r_multiple: null });
  assert.equal(live.graded_post_hoc, false);
});

test('a locked grade does not move: not by editing the plan, not by settling it', async () => {
  const planned = await post({ status: 'Planned', outcome: 'Not taken', r_multiple: null, chk_clean_path: false, chk_killzone: false });
  const score = planned.checklist_score;
  const edited = await put(planned.id, { status: 'Planned', outcome: 'Not taken', r_multiple: null });  // every box ticked now
  assert.equal(edited.checklist_score, score, 'editing a locked plan does not re-grade it');
  const settled = await put(planned.id, { status: 'Settled', outcome: 'Win', r_multiple: 3 });
  assert.equal(settled.checklist_score, score);
  assert.equal(settled.graded_post_hoc, false);
});

test('a backtest locked then settled counts toward step 1; one logged after the fact does not', async () => {
  const before = syncPath()[0].progress[0].value ?? 0;
  const locked = await post({ account: 'Backtest (FX Replay)', reason: 'Backtest replay', status: 'Planned', outcome: 'Not taken', r_multiple: null, chart_date: '2026-09-15' });
  await put(locked.id, { account: 'Backtest (FX Replay)', reason: 'Backtest replay', status: 'Settled', outcome: 'Win', r_multiple: 2, chart_date: '2026-09-15' });
  await post({ account: 'Backtest (FX Replay)', reason: 'Backtest replay', chart_date: '2026-09-15' }); // straight to Settled
  assert.equal(syncPath()[0].progress[0].value, before + 1);
  assert.equal(getTrade(locked.id)!.chart_date, '2026-09-15');
});

test('confidence under the minimum, taken: tagged, not following the rules, a broken trade', async () => {
  const t = await post({ confidence_at_entry: 2, followed_rules: true });
  assert.ok(t.mistake_tags.includes('Low confidence entry'));
  assert.equal(t.followed_rules, false);
  assert.equal(t.below_min_confidence, true);
  assert.equal(adherenceOf(t), 'broken');
  // Passed instead: nothing to tag.
  const passed = await post({ confidence_at_entry: 2, outcome: 'Not taken', r_multiple: null });
  assert.equal(passed.below_min_confidence, false);
  assert.ok(!passed.mistake_tags.includes('Low confidence entry'));
});

test('a low-confidence plan is tagged when it is settled as taken — the quick path too', async () => {
  const plan = await post({ confidence_at_entry: 1, status: 'Planned', outcome: 'Not taken', r_multiple: null });
  assert.equal(plan.below_min_confidence, false);
  const res = await settleRoute.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ outcome: 'Loss', r_multiple: 1 }) }),
    { params: Promise.resolve({ id: plan.id }) });
  assert.equal(res.status, 200);
  const settled = getTrade(plan.id)!;
  assert.equal(settled.below_min_confidence, true);
  assert.ok(settled.mistake_tags.includes('Low confidence entry'));
});

test('an old trade keeps its meaning when edited', async () => {
  const t = await post({});
  getDb().prepare('UPDATE trades SET grade_locked_at = NULL, below_min_confidence = NULL WHERE id = ?').run(t.id);
  const edited = await put(t.id, { confidence_at_entry: 2 });
  assert.equal(edited.below_min_confidence, null);
  assert.ok(!edited.mistake_tags.includes('Low confidence entry'));
});

test('the target check: R to the nearest liquidity, and what fails it', async () => {
  assert.equal(rToNearest({ entry_price: 100, stop_loss: 90, stop_points: null, nearest_liquidity_price: 112 }), 1.2);
  assert.equal(rToNearest({ entry_price: 100, stop_loss: null, stop_points: 10, nearest_liquidity_price: 130 }), 3);
  const v = targetCheck({ target_type: 'EQH/EQL', nearest_liquidity_type: 'PDH/PDL', nearest_liquidity_price: 112, opposing_swings_between: '2+',
    entry_price: 100, stop_loss: 90, stop_points: null, eqhl_checks: { touches: true, untested: false, in_range: true } });
  assert.equal(v.passed, false);
  assert.equal(v.warnings.length, 4);
  assert.ok(v.warnings.some((w) => w.includes('under 1.5R')));
  // Stored by the server, recomputed whatever the form sent.
  const t = await post({ entry_price: 100, stop_loss: 90, nearest_liquidity_type: 'PDH/PDL', nearest_liquidity_price: 125, opposing_swings_between: '0', r_to_nearest: 99, target_check_passed: false, be_trigger: '1R' });
  assert.equal(t.r_to_nearest, 2.5);
  assert.equal(t.target_check_passed, true);
  assert.equal(t.be_trigger, '1R');
});

test('the day’s loss limit: from that day’s prep, else the setting; past it, the trade carries why', async () => {
  assert.equal(stopAfterFor(parsePrepData({ answers: { 'session.stop': '1 loss' } }), DEFAULT_RULES), 1);
  assert.equal(stopAfterFor(null, DEFAULT_RULES), 2);
  const day = '2026-09-20';
  const bt = { account: 'Backtest (FX Replay)', reason: 'Backtest replay', chart_date: day, outcome: 'Loss', r_multiple: -1 };
  await post(bt); await post(bt);
  assert.equal(dayLimit('Backtest (FX Replay)', day).reached, true);
  const third = await post({ ...bt, outcome: 'Win', r_multiple: 2 });
  assert.equal(third.overrides.length, 1);
  assert.equal(third.overrides[0].kind, 'daily_limit');
  assert.equal(third.overrides[0].reason, null);
  const reason = 'Replaying the same session again on purpose to check the second entry model.';
  const fourth = await post({ ...bt, overrides: [{ kind: 'daily_limit', commitment_id: `day:${day}`, commitment_text: 'Stop after 2 losses', reason, at: '2026-10-16T21:00:00.000Z' }] });
  assert.equal(fourth.overrides.filter((o) => o.kind === 'daily_limit').length, 1);
  assert.equal(fourth.overrides[0].reason, reason);
  // A real day's prep can make it stricter.
  savePrep('2026-09-21', parsePrepData({ answers: { 'session.stop': '1 loss' } }));
  await post({ date: '2026-09-21T09:40', outcome: 'Loss', r_multiple: -1 });
  assert.equal(dayLimit('Demo', '2026-09-21').reached, true);
});

test('the form’s live numbers come from my own trades', () => {
  const ctx = guardContext('Demo', '2026-09-21', null);
  assert.equal(ctx.settings.minConfidence, 3);
  assert.ok(ctx.lowConfidence.n >= 2);
  assert.ok(ctx.lowConfidence.l >= 1);
  assert.equal(ctx.limit.stopAfter, 1);
});
