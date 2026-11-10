/*
  Rubric 4, on trial: the liquidity event. Graded beside rubric 3, never
  frozen onto a trade — and it must never move a rubric-3 grade.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-trial-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const {
  CURRENT_RUBRIC, HTF_DELIVERIES, RUBRICS, SWEEP_LEVELS, TRIAL_RUBRIC, TRIAL_SAMPLE, effectiveSweep, gradeUnder,
  liquidityEvent, trialEventOf,
} = await import('../lib/rubric');
const { createTrade, getTrade, updateTrade } = await import('../db/trades');
const { parseTradeInput } = await import('../lib/validate');
const { deliveryOnlyVerdict, modelBreakdowns, trialLine } = await import('../lib/stats');

type Answers = Parameters<typeof gradeUnder>[1];
const perfect: Answers = {
  chk_htf_bias: true, chk_killzone: true, chk_no_news: true, singular_gap: true,
  chk_displacement_fvg: true, chk_targets_clear: true, chk_clean_path: true,
  chk_returned_to_fvg: true, chk_inversion_close: true, target_type: 'EQH/EQL',
};
const trial = (a: Answers) => gradeUnder(TRIAL_RUBRIC!, a);
const capIds = (a: Answers) => trial(a).caps.map((c) => c.id).sort();

test('rubric 3 stays current; rubric 4 is the trial, with the same weights and bands', () => {
  assert.equal(CURRENT_RUBRIC, 3);
  assert.equal(TRIAL_RUBRIC, 4);
  assert.equal(RUBRICS[4].trial, true);
  assert.deepEqual(RUBRICS[4].weights, RUBRICS[3].weights);
  assert.deepEqual(RUBRICS[4].letters, RUBRICS[3].letters);
  assert.equal(TRIAL_SAMPLE, 30);
});

test('a sweep counts only with its level named', () => {
  assert.equal(effectiveSweep({ sweep_tier: 'major' }), 'none');
  assert.equal(effectiveSweep({ sweep_tier: 'major', sweep_level: '   ' }), 'none');
  assert.equal(effectiveSweep({ sweep_tier: 'major', sweep_level: 'PDL' }), 'major');
  assert.equal(trial({ ...perfect, sweep_tier: 'major' }).letter, 'C');
});

test('a MINOR sweep also needs NQ futures confirmation; a major does not', () => {
  const minor = { ...perfect, sweep_tier: 'minor' as const, sweep_level: 'Intraday high' };
  assert.equal(liquidityEvent({ ...minor, sweep_futures_confirmed: null }), 'none');
  assert.equal(liquidityEvent({ ...minor, sweep_futures_confirmed: false }), 'none');
  assert.equal(trial({ ...minor, sweep_futures_confirmed: false }).letter, 'C');
  const confirmed = trial({ ...minor, sweep_futures_confirmed: true });
  assert.equal(confirmed.score, 92);
  assert.equal(confirmed.letter, 'A');
  assert.equal(effectiveSweep({ sweep_tier: 'major', sweep_level: 'PDL', sweep_futures_confirmed: false }), 'major');
});

test('a perfect major sweep alone is an A, not an A+: A+ needs sweep AND delivery', () => {
  const g = trial({ ...perfect, sweep_tier: 'major', sweep_level: 'PDL' });
  assert.equal(g.score, 100);
  assert.equal(g.letter, 'A');
  assert.deepEqual(capIds({ ...perfect, sweep_tier: 'major', sweep_level: 'PDL' }), ['aplus']);
  const both = trial({ ...perfect, sweep_tier: 'major', sweep_level: 'PDL', htf_delivery: '5m FVG' });
  assert.equal(both.score, 100);
  assert.equal(both.letter, 'A+');
  assert.deepEqual(both.caps, []);
});

test('a confirmed minor sweep plus a delivery scores the full 20', () => {
  const g = trial({
    ...perfect, sweep_tier: 'minor', sweep_level: 'Intraday high', sweep_futures_confirmed: true, htf_delivery: '15m OB',
  });
  assert.equal(g.score, 100);
  assert.equal(g.letter, 'A+');
});

test('delivery alone passes the gate but caps at B', () => {
  const g = trial({ ...perfect, sweep_tier: 'none', htf_delivery: '4H FVG' });
  assert.equal(g.score, 92);
  assert.equal(g.letter, 'B');
  assert.deepEqual(capIds({ ...perfect, sweep_tier: 'none', htf_delivery: '4H FVG' }), ['aplus', 'delivery']);
});

test('the single gap is still a gate under the trial', () => {
  const g = trial({ ...perfect, singular_gap: false, sweep_tier: 'major', sweep_level: 'PDH', htf_delivery: '1H FVG' });
  assert.equal(g.letter, 'C');
});

test('the trial never moves a rubric-3 grade', () => {
  for (const extra of [{}, { sweep_level: 'PDL' }, { htf_delivery: '5m FVG' }, { sweep_futures_confirmed: false }]) {
    assert.equal(gradeUnder(3, { ...perfect, sweep_tier: 'major', ...extra }).letter, 'A+');
    assert.equal(gradeUnder(3, { ...perfect, sweep_tier: 'none', ...extra }).letter, 'C');
  }
});

test('a trade from before the trial reads as unrecorded, not as no liquidity event', () => {
  assert.equal(trialEventOf({ sweep_tier: 'major', sweep_level: null, htf_delivery: null, sweep_futures_confirmed: null }), 'unrecorded');
  assert.equal(trialEventOf({ sweep_tier: 'none', sweep_level: null, htf_delivery: '5m FVG', sweep_futures_confirmed: null }), 'delivery');
});

const raw = (t: Record<string, unknown> = {}) => ({
  date: '2026-10-01T08:00', instrument: 'NQ', direction: 'Short', session: 'NY AM', reason: 'Rules-based (A+ setup)',
  setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium', target_type: 'PDH/PDL',
  outcome: 'Win', r_multiple: 3.5, account: 'Live', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
  screenshot_path: 'x.png', ...perfect, sweep_tier: 'minor', ...t,
});
const input = (t: Record<string, unknown> = {}) => {
  const r = parseTradeInput(raw(t));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

test('the three answers round-trip through validation and the database; the frozen grade stays rubric 3', () => {
  const t = createTrade(input({ sweep_level: 'Intraday high', sweep_futures_confirmed: true, htf_delivery: '' }));
  assert.equal(t.sweep_level, 'Intraday high');
  assert.equal(t.sweep_futures_confirmed, true);
  assert.equal(t.htf_delivery, null);
  assert.equal(t.rubric_version, 3);
  assert.equal(t.grade_letter, 'A'); // rubric 3: minor sweep, 92
  assert.equal(gradeUnder(TRIAL_RUBRIC!, t).letter, 'A');

  const unchecked = createTrade(input({ sweep_level: 'PDL' }));
  assert.equal(unchecked.sweep_futures_confirmed, null, 'never checked must not read back as no');

  const edited = updateTrade(t.id, input({ sweep_level: 'Intraday high', sweep_futures_confirmed: false, htf_delivery: '5m FVG' }))!;
  assert.equal(getTrade(t.id)!.htf_delivery, '5m FVG');
  assert.equal(edited.grade_letter, 'A', 'the locked grade does not move');
});

test('nothing is typed: only listed levels and deliveries are kept, anything else reads as not named', () => {
  assert.ok(SWEEP_LEVELS.includes('Asia low') && SWEEP_LEVELS.includes('EQH'));
  assert.equal(HTF_DELIVERIES.length, 10);
  assert.ok(HTF_DELIVERIES.includes('5m FVG') && HTF_DELIVERIES.includes('Daily OB'));
  const typed = input({ sweep_level: '30,548 — 7:47 high', htf_delivery: '5m FVG 30,740–30,795' });
  assert.deepEqual([typed.sweep_level, typed.htf_delivery], [null, null]);
  const picked = input({ sweep_level: 'London low', htf_delivery: '1H OB' });
  assert.deepEqual([picked.sweep_level, picked.htf_delivery], ['London low', '1H OB']);
});

test('Stats splits by the trial event and counts the delivery-only sample', () => {
  const d1 = createTrade(input({ sweep_tier: 'none', htf_delivery: '4H FVG', r_multiple: 2 }));
  const d2 = createTrade(input({ sweep_tier: 'none', htf_delivery: '1H OB', outcome: 'Loss', r_multiple: -1 }));
  const old = createTrade(input({ sweep_tier: 'major' }));
  const rows = modelBreakdowns([d1, d2, old], [d1, d2, old]).liquidityTrial;
  assert.equal(rows.find((r) => r.key === 'delivery')!.stats.taken, 2);
  assert.equal(rows.find((r) => r.key === 'unrecorded')!.stats.taken, 1);
  const v = deliveryOnlyVerdict([d1, d2, old]);
  assert.deepEqual([v.n, v.avgR, v.ready, v.positive], [2, 0.5, false, true]);
});

test('skipped setups logged in Missed fill the trial sample, and say so', () => {
  const real = createTrade(input({ sweep_tier: 'none', htf_delivery: '4H FVG', r_multiple: 2 }));
  const missed = Array.from({ length: 3 }, (_, i) => createTrade(input({
    account: 'Missed', sweep_tier: 'none', htf_delivery: '15m FVG', outcome: i === 0 ? 'Loss' : 'Win', r_multiple: i === 0 ? -1 : 1.5,
  })));
  const v = deliveryOnlyVerdict([real], missed);
  assert.deepEqual([v.n, v.real, v.missed], [4, 1, 3]);
  assert.equal(v.avgR, (2 - 1 + 1.5 + 1.5) / 4);
  assert.equal(v.positive, true);
  assert.equal(v.ready, false);
  // Without the Missed setups, only the real one counts.
  assert.equal(deliveryOnlyVerdict([real]).n, 1);
});

test('the trial line: "30/30 reached · 43 logged", the verdict on all of them', () => {
  assert.equal(trialLine(4, { n: 12, avgR: 0.25, ready: false, positive: true }), 'Rubric 4 trial: 12/30 setups, +0.25R avg.');
  assert.equal(trialLine(4, { n: 43, avgR: 0.31, ready: true, positive: true }), 'Rubric 4 trial: 30/30 reached · 43 logged, +0.31R avg — verdict on all 43 setups: promote.');
  assert.match(trialLine(4, { n: 30, avgR: -0.1, ready: true, positive: false }), /verdict on all 30 setups: drop\.$/);
});
