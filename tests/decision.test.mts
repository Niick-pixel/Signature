/*
  Rubric v2 (046): the four-row grade (gates, caps, totals), the timed
  decision (expiry → missed, the grace, locking), the computed "rules
  followed", the consistency flags, and the record — saved at Step 1 with its
  outcome pending, Step 1 read-only after, old trades untouched.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-decision-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const D = await import('../lib/decision');
const { createTrade, updateTrade } = await import('../db/trades');
const { parseTradeInput } = await import('../lib/validate');
const { applyRules } = await import('../db/rules');
const { getDb } = await import('../db/index');

const rows = (s: number, i: number, p: number, t: number) => ({ row_sweep: s, row_inversion: i, row_path: p, row_target: t });
const facts = { direction: 'Long', plan_scenario: 'A', leg_location: 'Discount', planned_rr: '2' } as const;

/* ───────────── the grade ───────────── */

test('totals: 8 is A+, 6–7 A, 5 B, 4 or less no trade', () => {
  assert.equal(D.gradeV2({ ...rows(2, 2, 2, 2), ...facts }).letter, 'A+');
  assert.equal(D.gradeV2({ ...rows(2, 2, 2, 1), ...facts }).letter, 'A');
  assert.equal(D.gradeV2({ ...rows(2, 1, 2, 1), ...facts }).letter, 'A');
  assert.equal(D.gradeV2({ ...rows(1, 1, 2, 1), ...facts }).letter, 'B');
  const four = D.gradeV2({ ...rows(1, 1, 1, 1), ...facts });
  assert.equal(four.letter, 'No trade');
  assert.equal(four.total, 4);
});

test('gate: any row at 0 is no trade, and the row is named', () => {
  const g = D.gradeV2({ ...rows(2, 2, 0, 2), ...facts });
  assert.equal(g.letter, 'No trade');
  assert.deepEqual(g.gate, { key: 'row_path', label: 'Path' });
  assert.match(g.reason, /Path scored 0/);
});

test('caps: scenario B, unplanned, long in premium, short in discount — each max B, each named', () => {
  for (const [patch, id] of [
    [{ plan_scenario: 'B' }, 'scenario-b'], [{ plan_scenario: 'none' }, 'unplanned'],
    [{ direction: 'Long', leg_location: 'Premium' }, 'leg'], [{ direction: 'Short', leg_location: 'Discount' }, 'leg'],
  ] as const) {
    const g = D.gradeV2({ ...rows(2, 2, 2, 2), ...facts, ...patch });
    assert.equal(g.letter, 'B', id);
    assert.ok(g.caps.some((c) => c.id === id), id);
    assert.ok(g.reason.length > 0);
  }
  // Short in premium and long in discount are the right side: no cap.
  assert.equal(D.gradeV2({ ...rows(2, 2, 2, 2), ...facts, direction: 'Short', leg_location: 'Premium' }).letter, 'A+');
  // A cap never raises: a B with a cap is still B, a no trade still no trade.
  assert.equal(D.gradeV2({ ...rows(1, 1, 2, 1), ...facts, plan_scenario: 'B' }).letter, 'B');
  assert.equal(D.gradeV2({ ...rows(1, 1, 1, 1), ...facts, plan_scenario: 'B' }).letter, 'No trade');
});

test('planned R under 1.5 is no trade; unanswered rows leave the grade incomplete', () => {
  const g = D.gradeV2({ ...rows(2, 2, 2, 2), ...facts, planned_rr: '1' });
  assert.equal(g.letter, 'No trade');
  assert.equal(g.lowR, true);
  const partial = D.gradeV2({ row_sweep: 2, row_inversion: 2, ...facts });
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.missing, ['row_path', 'row_target']);
  assert.equal(D.gradeV2({ ...rows(2, 2, 2, 2), direction: 'Long' }).complete, false, 'scenario, leg and R still owed');
});

test('stored: no trade as F, the score as total over 8', () => {
  assert.deepEqual(D.storedGrade(D.gradeV2({ ...rows(2, 2, 2, 2), ...facts })), { letter: 'A+', score: 100 });
  assert.deepEqual(D.storedGrade(D.gradeV2({ ...rows(2, 2, 0, 2), ...facts })), { letter: 'F', score: 75 });
  assert.equal(D.V2_LETTER_OF('F'), 'No trade');
});

/* ───────────── the clock and the decision ───────────── */

test('the clock: amber at 10 s, red at 5 s, expired at the limit, then counting what is over', () => {
  const t0 = 1_000_000;
  assert.equal(D.clock(t0, t0 + 29_000, 40).tone, 'calm');
  assert.equal(D.clock(t0, t0 + 30_000, 40).tone, 'amber');
  assert.equal(D.clock(t0, t0 + 35_500, 40).tone, 'red');
  assert.equal(D.clock(t0, t0 + 40_000, 40).expired, true);
  assert.equal(D.clock(t0, t0 + 39_000, 40).over, 0);
  assert.equal(D.clock(t0, t0 + 55_000, 40).over, 15);
});

test('take and pass before the limit store the time taken; the override only on a no-trade take', () => {
  const t0 = 5_000_000;
  const g = D.gradeV2({ ...rows(2, 2, 2, 1), ...facts });
  const take = D.lockDecision({ choice: 'take', startedAt: t0, at: t0 + 21_340, limit: 40, grade: g });
  assert.equal(take.decision, 'take');
  assert.equal(take.decision_seconds, 21.3);
  assert.equal(take.grade_override, false);
  assert.equal(take.decided_at, new Date(t0 + 21_340).toISOString());
  const bad = D.gradeV2({ ...rows(2, 0, 2, 2), ...facts });
  assert.equal(D.needsOverride(bad), true);
  assert.equal(D.lockDecision({ choice: 'take', startedAt: t0, at: t0 + 9000, limit: 40, grade: bad, override: true }).grade_override, true);
  assert.equal(D.lockDecision({ choice: 'pass', startedAt: t0, at: t0 + 9000, limit: 40, grade: bad, override: true }).grade_override, false);
});

test('time running out decides nothing: Take, Pass or Missed is chosen, with the real time and the late rows', () => {
  const t0 = 9_000_000;
  const g = D.gradeV2({ ...rows(2, 2, 1, 2), ...facts });
  const m = D.lockDecision({
    choice: 'missed', startedAt: t0, at: t0 + 52_000, limit: 40, grade: g,
    scoredAt: { row_sweep: t0 + 10_000, row_inversion: t0 + 20_000, row_path: t0 + 44_000, row_target: t0 + 51_000 },
  });
  assert.equal(m.decision, 'missed');
  assert.equal(m.decision_seconds, 52);
  assert.deepEqual(m.late_rows, ['row_path', 'row_target']);
  // A take after the limit stays a take — stored with the time it really took, and read as over time.
  const late = D.lockDecision({ choice: 'take', startedAt: t0, at: t0 + 47_000, limit: 40, grade: g });
  assert.deepEqual([late.decision, late.decision_seconds], ['take', 47]);
  assert.equal(D.overTime(late), true);
  assert.equal(D.overTime(m), false, 'a miss is its own bucket');
  assert.equal(D.overTime({ decision: 'take', decision_seconds: 30, decision_limit: 40 }), false);
  // Untimed (Demo, Live): no limit, no miss, nothing late.
  const live = D.lockDecision({ choice: 'take', startedAt: t0, at: t0 + 300_000, limit: null, grade: g });
  assert.deepEqual([live.decision, live.decision_seconds, live.decision_limit, live.late_rows], ['take', 300, null, null]);
});

test('discard: only while no row has been scored', () => {
  assert.equal(D.canDiscard({}), true);
  assert.equal(D.canDiscard({ row_target: 0 }), false);
});

/* ───────────── rules followed, consistency ───────────── */

test('rules followed: computed from the override, the "me" tags, risk, and day rules off backtests', () => {
  const cfg = { maxRiskPct: 1, backtest: false };
  assert.deepEqual(D.rulesFollowedV2({ mistake_tags: [] }, cfg), { followed: true, reasons: [] });
  const r = D.rulesFollowedV2({ grade_override: true, mistake_tags: ['Moved stop before BE trigger', 'Some old tag'] }, cfg);
  assert.equal(r.followed, false);
  assert.deepEqual(r.reasons, ['Took it although the grade said no trade', 'Moved stop before BE trigger']);
  assert.deepEqual(D.rulesFollowedV2({ risk_percent: 1.5 }, cfg).reasons, ['Risk over 1%']);
  assert.deepEqual(D.rulesFollowedV2({}, { ...cfg, dayBreaks: ['At most 2 trades'] }).reasons, ['At most 2 trades']);
  assert.deepEqual(D.rulesFollowedV2({}, { ...cfg, backtest: true, dayBreaks: ['At most 2 trades'] }).reasons, [], 'a backtest has no real days');
});

test('consistency: a stop moved before a 1R trigger the trade reached; "just short" under 80% of the plan', () => {
  assert.equal(D.consistencyFlags({ mistake_tags: ['Moved stop before BE trigger'], reached_1r: true, management: 'BE at 1R' }).length, 1);
  assert.equal(D.consistencyFlags({ mistake_tags: ['Moved stop before BE trigger'], reached_1r: false, management: 'BE at 1R' }).length, 0);
  assert.equal(D.consistencyFlags({ mistake_tags: ['Moved stop before BE trigger'], reached_1r: true, management: 'BE on structure break' }).length, 0);
  // "Turned just short of target" is computed now, so it never needs a consistency check.
  assert.equal(D.consistencyFlags({ market_tags: ['Turned just short of target'], mfe_r: 1.5, planned_rr: '2' }).length, 0);
});

/* ───────────── the record ───────────── */

const step1 = (x: Record<string, unknown> = {}) => ({
  date: '2026-11-13T09:45', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Backtest replay',
  setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL',
  outcome: 'Win', r_multiple: null, account: 'Backtest (FX Replay)', status: 'Live', explanation: '', lesson: '',
  ...rows(2, 2, 2, 1), singular_gap: true, htf_origin: '15m', plan_scenario: 'A', leg_location: 'Discount', planned_rr: '2', entry_method: 'On inversion close',
  confidence_at_entry: 4, decision: 'take', decided_at: '2026-11-13T09:45:21.000Z', decision_seconds: 21.3, decision_limit: 40,
  grade_override: false, ...x,
});
const save = (x: Record<string, unknown> = {}) => {
  const r = parseTradeInput(step1(x));
  if (!r.ok) throw new Error(r.error);
  return createTrade(applyRules(r.value, null));
};

test('Step 1 saves with the outcome pending: no writing owed, graded under rubric 5, locked before the outcome', () => {
  const t = save();
  assert.equal(t.rubric_version, 5);
  assert.equal(t.grade_letter, 'A');
  assert.equal(t.checklist_score, 88);
  assert.equal(t.decision, 'take');
  assert.equal(t.outcome_at, null);
  assert.equal(t.graded_post_hoc, false);
  assert.equal(t.grade_locked_at, '2026-11-13T09:45:21.000Z');
});

test('deciding needs all four rows and the scenario — except a miss, which may leave rows empty', () => {
  const short = parseTradeInput(step1({ row_target: null }));
  assert.equal(short.ok, false);
  assert.equal(parseTradeInput(step1({ plan_scenario: null })).ok, false);
  const miss = save({ decision: 'missed', outcome: 'Not taken', status: 'Settled', row_target: null, decision_seconds: 40, late_rows: ['row_path'] });
  assert.equal(miss.decision, 'missed');
  assert.equal(miss.grade_letter, null, 'an unfinished grade stores no letter');
  assert.deepEqual(miss.late_rows, ['row_path']);
});

test('locking: Step 1 cannot be edited after the decision, by the form or the database', () => {
  const t = save();
  // An edit that tries to change the rows and the scenario keeps the stored ones.
  const r = parseTradeInput({ ...step1(), ...rows(0, 0, 0, 0), plan_scenario: 'B', direction: 'Short', outcome_at: '2026-11-13T10:30:00.000Z',
    r_multiple: 2, status: 'Settled', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170) },
  { previous: { explanation: '', lesson: '', status: 'Live', stored: t as unknown as Record<string, unknown> } });
  if (!r.ok) throw new Error(r.error);
  const back = updateTrade(t.id, r.value)!;
  assert.deepEqual([back.row_sweep, back.row_path, back.plan_scenario, back.direction], [2, 2, 'A', 'Long']);
  assert.equal(back.grade_letter, 'A', 'the grade at the decision stays');
  assert.equal(back.outcome_at, '2026-11-13T10:30:00.000Z');
  // And the database itself refuses a direct change.
  assert.throws(() => updateTrade(t.id, { ...r.value, row_sweep: 0 }), /Step 1 is locked/);
});

test('a pass or a miss needs its hypothetical outcome once Step 2 is written', () => {
  const t = save({ decision: 'pass', outcome: 'Not taken', status: 'Settled' });
  const prev = { previous: { explanation: '', lesson: '', status: 'Settled' as const, stored: t as unknown as Record<string, unknown> } };
  const without = parseTradeInput({ ...step1({ decision: 'pass', outcome: 'Not taken', status: 'Settled' }), outcome_at: '2026-11-13T11:00:00.000Z',
    explanation: 'E'.repeat(170), lesson: 'L'.repeat(170) }, prev);
  assert.equal(without.ok, false);
  const withR = parseTradeInput({ ...step1({ decision: 'pass', outcome: 'Not taken', status: 'Settled' }), outcome_at: '2026-11-13T11:00:00.000Z',
    would_be_r: -1, would_be_mfe_r: 0.4, explanation: 'E'.repeat(170), lesson: 'L'.repeat(170), pass_reasons: ['Rubric said no trade'] }, prev);
  assert.equal(withR.ok, true);
});

test('old trades are untouched: no decision, graded under the checklist rubric as before', () => {
  const r = parseTradeInput({
    date: '2026-10-01T08:00', instrument: 'NQ', direction: 'Short', session: 'NY AM', reason: 'Rules-based (A+ setup)',
    setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium', target_type: 'EQH/EQL',
    outcome: 'Win', r_multiple: 2, account: 'Live', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
    screenshot_path: 'x.png', sweep_tier: 'major', singular_gap: true, chk_returned_to_fvg: true, chk_inversion_close: true,
  });
  if (!r.ok) throw new Error(r.error);
  const t = createTrade(r.value);
  assert.equal(t.rubric_version, 3);
  assert.deepEqual([t.decision, t.row_sweep, t.outcome_at, t.leg_location], [null, null, null, null]);
});

test('the review reads the "me" tags and the override; old trades\' execution tags count in the weekly review only; market tags never', async () => {
  const { checkTrade, oldExecutionBreaks } = await import('../lib/review');
  const { adherenceOf } = await import('../lib/adherence');
  const v2 = save({ outcome: 'Loss', r_multiple: -1, status: 'Settled', outcome_at: '2026-11-13T10:00:00.000Z', screenshot_path: 'x.png', mistake_tags: ['Moved stop before BE trigger'], market_tags: ['News spike'],
    explanation: 'E'.repeat(170), lesson: 'L'.repeat(170) });
  assert.deepEqual(checkTrade(v2).map((b) => b.short), ['Moved stop before BE trigger']);
  assert.equal(adherenceOf(v2), 'broken');
  const clean = save({ outcome: 'Win', r_multiple: 2, status: 'Settled', outcome_at: '2026-11-13T10:00:00.000Z', screenshot_path: 'x.png', market_tags: ['News spike'],
    explanation: 'E'.repeat(170), lesson: 'L'.repeat(170) });
  assert.deepEqual(checkTrade(clean), [], 'a v2 trade is never judged by the old checklist rules');
  assert.equal(adherenceOf(clean), 'followed');
  const forced = save({ ...rows(2, 0, 2, 2), grade_override: true, outcome: 'Win', r_multiple: 1, status: 'Settled', outcome_at: '2026-11-13T10:00:00.000Z', screenshot_path: 'x.png',
    explanation: 'E'.repeat(170), lesson: 'L'.repeat(170) });
  assert.ok(checkTrade(forced).some((b) => b.id === 'override'));
  // An older trade tagged "Moved stop" now shows it as a rule broken in the weekly review.
  const r = parseTradeInput({
    date: '2026-10-01T09:45', instrument: 'NQ', direction: 'Short', session: 'NY AM', reason: 'Rules-based (A+ setup)',
    setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Premium', target_type: 'EQH/EQL',
    outcome: 'Loss', r_multiple: -1, account: 'Live', explanation: 'E'.repeat(170), lesson: 'L'.repeat(170),
    screenshot_path: 'x.png', mistake_tags: ['Moved stop'], market_tags: ['Stopped by a wick'],
  });
  if (!r.ok) throw new Error(r.error);
  const old = createTrade(r.value);
  const weekly = oldExecutionBreaks(old).map((b) => b.short);
  assert.ok(weekly.includes('Moved stop'));
  assert.ok(!weekly.includes('Stopped by a wick'));
  // Rules kept, the rings and the score judge the old trade by its own rule book, as before rubric v2.
  assert.ok(!checkTrade(old).some((b) => b.short === 'Moved stop'), 'not in checkTrade');
});

test('stats: v2 records only, by total, row, scenario, time and decision; passes and misses at their hypothetical R', async () => {
  const { decisionStats } = await import('../lib/decisionStats');
  const base = { rubric_version: 5, decided_at: 'x', outcome_at: 'y', deleted_at: null, plan_scenario: 'A', decision_limit: 40 };
  const ts = [
    { ...base, ...rows(2, 2, 2, 2), decision: 'take', r_multiple: 2, decision_seconds: 12 },
    { ...base, ...rows(2, 2, 2, 2), decision: 'take', r_multiple: -1, decision_seconds: 25 },
    { ...base, ...rows(1, 1, 1, 1), decision: 'pass', would_be_r: -1, decision_seconds: 30, plan_scenario: 'B' },
    { ...base, ...rows(2, 1, 1, 1), decision: 'missed', would_be_r: 3, decision_seconds: 40 },
    { ...base, ...rows(2, 2, 2, 2), decision: 'take', r_multiple: 5, outcome_at: null, decision_seconds: 5 }, // pending: never counted
    { rubric_version: 3, decision: null, r_multiple: 9 }, // the old scale: never mixed in
  ] as never[];
  const d = decisionStats(ts);
  assert.equal(d.n, 4);
  assert.deepEqual(d.byTotal[8].taken, { n: 2, avgR: 0.5 });
  assert.equal(d.byTotal[4].passed, 1);
  assert.equal(d.byTotal[5].missed, 1);
  assert.deepEqual(d.byRow.row_sweep[2], { n: 2, avgR: 0.5 });
  assert.equal(d.byScenario.find((s) => s.key === 'A')!.cell.n, 2);
  assert.deepEqual(d.decisions.map((x) => [x.key, x.cell.n, x.cell.avgR]), [['take', 2, 0.5], ['pass', 1, -1], ['missed', 1, 3]]);
  assert.equal(d.time.missed, 1);
  assert.equal(d.time.timed, 4);
  assert.deepEqual(d.time.buckets.map((b) => [b.label, b.n]), [['0–10s', 0], ['10–20s', 1], ['20–30s', 1], ['30–40s', 1], ['Over time', 0], ['Missed', 1]]);
  assert.equal(d.time.over, 0);
});

test('exports: a v2 trade names its rubric and carries its rows, decision and time; an old one names its checklist rubric', () => {
  const lines = D.v2Lines({ ...rows(2, 2, 1, 2), singular_gap: true, htf_origin: '1H', direction: 'Long', plan_scenario: 'B', leg_location: 'Discount', planned_rr: '2', rubric_version: 5,
    grade_letter: 'B', decision: 'take', decision_seconds: 18.2, decision_limit: 40, grade_override: false, target_type: 'PDH/PDL', entry_method: 'On inversion close', confidence_at_entry: 4 });
  assert.match(lines[0], /Rubric v2 \(4 rows\) · singular gap one gap · Sweep 2 · Inversion 2 · Path 1 · Target 2 = 7\/8 → \*\*B\*\* \(Scenario B/);
  assert.match(lines[1], /HTF origin 1H/);
  assert.match(lines[2], /Taken in 18\.2s of 40s/);
  assert.equal(D.rubricName({ rubric_version: 3 }), 'checklist rubric 3');
  assert.equal(D.v2Result({ decision: 'missed', outcome_at: 'x', would_be_r: -1 }), 'Missed — too slow · would have −1.0R');
});

/* ───────────── 047: the singular-gap gate, the HTF origin, planned R, lighter passes ───────────── */

test('the singular-gap gate: more than one gap is No trade, named, and never part of the /8', () => {
  const many = D.gradeV2({ ...rows(2, 2, 2, 2), ...facts, singular_gap: false });
  assert.equal(many.letter, 'No trade');
  assert.equal(many.total, 8, 'the rows still add up; the gate sits outside them');
  assert.deepEqual(many.gate, { key: 'singular_gap', label: 'Singular gap' });
  assert.match(many.reason, /more than one gap/);
  const one = D.gradeV2({ ...rows(2, 2, 2, 2), ...facts, singular_gap: true });
  assert.equal(one.letter, 'A+');
  assert.equal(one.gate, null);
  // Unanswered: the grade shows, but it is not complete (Take waits on it).
  const open = D.gradeV2({ ...rows(2, 2, 2, 2), ...facts });
  assert.equal(open.letter, 'A+');
  assert.equal(open.complete, false);
  assert.equal(D.storedGrade(many).letter, 'F');
});

test('planned R: under 1.5 is No trade, and the form offers nothing below 1.5', () => {
  const g = D.gradeV2({ ...rows(2, 2, 2, 2), ...facts, singular_gap: true, planned_rr: '1.2' });
  assert.equal(g.letter, 'No trade');
  assert.equal(g.lowR, true);
  assert.ok(D.V2_PLANNED_RS.every((r) => Number.parseFloat(r) >= 1.5));
});

test('deciding needs the gate and the planned R; HTF origin is stored and locked, never graded', () => {
  const noGap = parseTradeInput(step1({ singular_gap: null }));
  assert.equal(noGap.ok, false);
  assert.match(noGap.ok ? '' : noGap.error, /singular-gap/);
  const noR = parseTradeInput(step1({ planned_rr: null }));
  assert.equal(noR.ok, false);
  assert.match(noR.ok ? '' : noR.error, /planned R/);
  // A miss owes neither (the clock ran out).
  assert.equal(parseTradeInput(step1({ decision: 'missed', singular_gap: null, planned_rr: null, ...rows(2, 2, null, null) })).ok, true);
  const t = save({ htf_origin: '4H' });
  assert.equal(t.htf_origin, '4H');
  assert.equal(t.singular_gap, true);
  assert.throws(() => getDb().prepare('UPDATE trades SET htf_origin = ? WHERE id = ?').run('5m', t.id), /Step 1 is locked/);
  assert.throws(() => getDb().prepare('UPDATE trades SET singular_gap = 0 WHERE id = ?').run(t.id), /Step 1 is locked/);
  assert.equal(D.gradeV2({ ...rows(2, 2, 2, 2), ...facts, singular_gap: true }).letter, D.gradeV2({ ...rows(2, 2, 2, 2), ...facts, singular_gap: true, ...{ htf_origin: '4H' } }).letter);
});

test('a pass or a miss owes the hypothetical R and one line; the lesson is optional; taken trades keep 160 + 160', () => {
  const pass = save({ decision: 'pass', status: 'Settled', outcome: 'Not taken' });
  const write = (x: Record<string, unknown>) => parseTradeInput({ ...pass, ...x, outcome_at: '2026-11-13T11:00:00.000Z' }, { previous: { explanation: '', lesson: '', status: 'Settled', stored: pass as unknown as Record<string, unknown> } });
  assert.equal(write({ would_be_r: -1, explanation: 'short', lesson: '' }).ok, false, 'under 20 characters');
  // No reason: refused; one reason, the first picked becomes the main one.
  const noReason = write({ would_be_r: -1, explanation: 'Two gaps in the leg, passed.', lesson: '' });
  assert.equal(noReason.ok, false);
  assert.match(noReason.ok ? '' : noReason.error, /reason/);
  const ok = write({ would_be_r: -1, explanation: 'Two gaps in the leg, passed.', lesson: '', pass_reasons: ['Doubt or fear', 'Unclear target'] });
  assert.equal(ok.ok, true, ok.ok ? '' : ok.error);
  assert.equal((ok as { value: { pass_main_reason: string } }).value.pass_main_reason, 'Doubt or fear');
  const main = write({ would_be_r: -1, explanation: 'Two gaps in the leg, passed.', lesson: '', pass_reasons: ['Doubt or fear', 'Unclear target'], pass_main_reason: 'Unclear target' });
  assert.equal((main as { value: { pass_main_reason: string } }).value.pass_main_reason, 'Unclear target');
  const take = save();
  const taken = parseTradeInput({ ...take, outcome: 'Win', r_multiple: 2, status: 'Settled', screenshot_path: 'x.png', explanation: 'Two gaps in the leg, passed.', lesson: '', outcome_at: '2026-11-13T11:00:00.000Z' },
    { previous: { explanation: '', lesson: '', status: 'Live', stored: take as unknown as Record<string, unknown> } });
  assert.equal(taken.ok, false, 'a taken trade still owes 160');
});

/* ───────────── the tag row: mirrors and computed market tags ───────────── */

test('ME and WORKED: twelve each, every ME tag has its mirror at the same grid position, a tag and its mirror never together', () => {
  assert.equal(D.ME_TAGS.length, 12);
  assert.equal(D.WORKED_TAGS_V2.length, 12);
  for (const [me, worked] of D.MIRRORS) {
    assert.ok((D.ME_TAGS as readonly string[]).includes(me) && (D.WORKED_TAGS_V2 as readonly string[]).includes(worked), `${me} ↔ ${worked}`);
  }
  // Same position on the 3 × 4 grid, except the second entry mistake (it shares "Entered on the trigger close").
  D.ME_TAGS.forEach((me, i) => {
    if (me === 'Entered early (before close or open)') return;
    assert.ok(D.mirrorsOf(me).includes(D.WORKED_TAGS_V2[i]), `${me} sits opposite ${D.WORKED_TAGS_V2[i]}`);
  });
  assert.deepEqual(D.mirrorsOf('Entered on the trigger close').sort(), ['Entered early (before close or open)', 'Entered late / chased']);
  assert.match(D.tagBlocked('Sized correctly', { me: ['Sized wrong'], worked: [] }) ?? '', /opposite/);
  assert.equal(D.tagBlocked('Sized correctly', { me: ['Missed a level in prep'], worked: [] }), null);
  assert.ok(D.tagBlocked('Decided within time', { me: [], worked: [] }, { decision: 'take', overTime: true }));
  assert.equal(D.tagBlocked('Decided within time', { me: [], worked: [] }, { decision: 'take', overTime: false }), null);
});

test('market: four tapped, two computed — just short of target (Max R ≥ 80% of planned, not at TP) and failed immediately (Max R < 0.3R)', () => {
  assert.deepEqual(D.autoMarketTags({ mfe_r: 1.7, planned_rr: '2', exit_reason: 'SL' }), ['Turned just short of target']);
  assert.deepEqual(D.autoMarketTags({ mfe_r: 2.1, planned_rr: '2', exit_reason: 'TP' }), []);
  assert.deepEqual(D.autoMarketTags({ mfe_r: 0.2, planned_rr: '2', exit_reason: 'SL' }), ['Failed immediately']);
  assert.deepEqual(D.autoMarketTags({ mfe_r: null, planned_rr: '2', exit_reason: 'SL' }), []);
  assert.equal(D.MARKET_TAGS_V2.length, 4);
});

test('retired v2 "me" tags still count as rules broken on the trades that carry them; new ones count too', () => {
  const cfg = { maxRiskPct: 1, backtest: true };
  assert.deepEqual(D.rulesFollowedV2({ mistake_tags: ['Oversized'] }, cfg).reasons, ['Oversized']);
  assert.deepEqual(D.rulesFollowedV2({ mistake_tags: ['No management plan before entry'] }, cfg).reasons, ['No management plan before entry']);
  assert.equal(D.rulesFollowedV2({ mistake_tags: ['Chop / no follow-through'] }, cfg).followed, true);
});

/* ───────────── the drill on v2 fields ───────────── */

test('the Setup-detail drill on a v2 trade reads planned R, entry, target, confidence and HTF origin — never the old form\'s fields', async () => {
  const { DATA_GROUPS, fillsGroup, groupFields } = await import('../lib/drill');
  const { hitTest } = await import('../lib/edge/flaws');
  const setup = DATA_GROUPS.find((g) => g.key === 'setup')!;
  const v2 = { rubric_version: 5, decision: 'take', planned_rr: '2', entry_method: 'On inversion close', target_type: 'PDH/PDL', confidence_at_entry: 4, htf_origin: '15m',
    liquidity_event: null, candle_strength: null } as never;
  assert.deepEqual([...groupFields(v2, setup)], ['planned_rr', 'entry_method', 'target_type', 'confidence_at_entry', 'htf_origin']);
  assert.equal(fillsGroup(v2, setup), true, 'old-form fields left empty do not count against a v2 trade');
  assert.equal(fillsGroup({ ...(v2 as object), htf_origin: null } as never, setup), false);
  const hit = hitTest('data', { themesOf: () => [], breaksOf: () => [], states: new Map(), exec: { earlyBe: { ids: [] } } as never });
  assert.equal(hit(v2), false, 'no flaw on a filled v2 trade');
  // An old trade is still measured on the old form's fields.
  assert.equal(fillsGroup({ rubric_version: 3, liquidity_event: 'x', entry_method: 'y', candle_strength: 'z', planned_rr: '2' } as never, setup), true);
});
