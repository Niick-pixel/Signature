/*
  Replay plans (048): the day bias, the zones by side, the <1.5R warning,
  lock and amend (the original kept), sittings, closing a day, and a trade
  without a plan (unplanned, capped at B) or on a no-bias day.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-replay-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const R = await import('../lib/replay');
const DB = await import('../db/replay');
const D = await import('../lib/decision');
const { createTrade } = await import('../db/trades');
const { parseTradeInput } = await import('../lib/validate');
const { applyRules } = await import('../db/rules');

const ctx = (x: Partial<import('../lib/replay').ReplayContext> = {}) => ({ ...R.emptyContext(), h4: 'Bull' as const, h1Agrees: true, overnight: 'Lows run' as const, news: 'Data at 8:30 ET' as const, open: 'Discount' as const, ...x });
const sc = (x: Partial<import('../lib/replay').ReplayScenario> = {}) => ({ ...R.emptyScenario(), zones: ['PDL'], confirm: ['Sweep + iFVG close'], target: 'PDH/PDL', rr: '2+' as const, kill: 'Not triggered by 10:30' as const, ...x });

test('day bias: the 4H direction when the 1H agrees; otherwise no bias', () => {
  assert.equal(R.dayBias({ h4: 'Bull', h1Agrees: true }), 'Long');
  assert.equal(R.dayBias({ h4: 'Bear', h1Agrees: true }), 'Short');
  assert.equal(R.dayBias({ h4: 'Bull', h1Agrees: false }), null);
  assert.equal(R.dayBias({ h4: 'None', h1Agrees: true }), null);
  assert.equal(R.dayBias({ h4: null, h1Agrees: null }), null);
  // A follows the bias, B is the other way; with no bias A is tapped and both are capped.
  const s = R.withDirections(ctx(), { a: sc(), b: sc() });
  assert.deepEqual([s.a.dir, s.b.dir], ['Long', 'Short']);
  const none = R.withDirections(ctx({ h1Agrees: false }), { a: sc({ dir: 'Short' }), b: sc() });
  assert.deepEqual([none.a.dir, none.b.dir], ['Short', 'Long']);
  assert.equal(R.noBiasCap(ctx({ h1Agrees: false })), true);
  assert.equal(R.noBiasCap(ctx()), false);
});

test('zones: the low side for a long, the high side for a short; the data wick only on a news day', () => {
  assert.ok(R.zoneOptions('Long', 'None').includes('Asia low') && !R.zoneOptions('Long', 'None').includes('Asia high'));
  assert.ok(R.zoneOptions('Short', 'None').includes('PDH') && !R.zoneOptions('Short', 'None').includes('PDL'));
  assert.ok(!R.zoneOptions('Long', 'None').includes('Data wick'));
  assert.ok(R.zoneOptions('Long', 'Data at 10:00 ET').includes('Data wick'));
  assert.ok(R.targetOptions('Data at 8:30 ET').includes('Data wick') && !R.targetOptions('None').includes('Data wick'));
  // At most two zones are kept.
  assert.equal(R.parseScenarios({ a: { zones: ['PDL', 'Asia low', 'London low'] } }, ctx()).a.zones.length, 2);
});

test('a rough R under 1.5 warns that the scenario cannot produce a trade', () => {
  assert.match(R.rrWarning('<1.5') ?? '', /can't produce a trade/);
  assert.equal(R.rrWarning('1.5–2'), null);
  assert.equal(R.rrWarning('2+'), null);
});

test('lock: nothing typed, everything tapped; the plan is read-only after, an amendment is kept beside it and flags the day', () => {
  assert.ok(R.lockMissing(R.emptyContext(), R.emptyScenarios()).length > 5);
  assert.deepEqual(R.lockMissing(ctx(), { a: sc(), b: sc({ zones: ['PDH'] }) }), []);
  const d = DB.lockReplayDay({ replay_date: '2026-03-03', instrument: 'NQ', context: ctx(), scenarios: R.withDirections(ctx(), { a: sc(), b: sc({ zones: ['PDH'] }) }), at: '2026-11-13T10:00:00.000Z' });
  assert.ok(d.locked_at);
  assert.equal(d.weekday, 'Tue');
  assert.equal(d.sequence, 1);
  assert.throws(() => DB.lockReplayDay({ replay_date: '2026-03-04', instrument: 'NQ', context: ctx(), scenarios: R.emptyScenarios(), at: '2026-11-13T10:05:00.000Z' }), /Close the current replay day/);
  const amended = DB.amendReplayDay(d.id, ctx({ open: 'EQ' }), d.scenarios);
  assert.ok(amended.amended_at);
  assert.equal(amended.context.open, 'Discount', 'the locked original is untouched');
  assert.equal(amended.amended_context?.open, 'EQ');
  assert.equal(R.planOf(amended).context.open, 'Discount', 'trades and Stats read the original');
});

test('days number within a sitting; ending the sitting, or a later calendar date, starts Day 1 again', () => {
  const first = DB.activeReplayDay()!;
  DB.closeReplayDay(first.id, { outcome: 'A', took_a: 'yes', took_b: null, ends_sitting: false });
  const second = DB.lockReplayDay({ replay_date: R.nextWeekday('2026-03-03'), instrument: 'NQ', context: ctx(), scenarios: first.scenarios, at: '2026-11-13T10:30:00.000Z' });
  assert.deepEqual([second.sequence, second.sitting_id, second.replay_date], [2, first.sitting_id, '2026-03-04']);
  DB.closeReplayDay(second.id, { outcome: 'C', took_a: null, took_b: null, ends_sitting: true });
  const third = DB.lockReplayDay({ replay_date: '2026-03-05', instrument: 'NQ', context: ctx(), scenarios: first.scenarios, at: '2026-11-13T11:00:00.000Z' });
  assert.equal(third.sequence, 1);
  assert.notEqual(third.sitting_id, first.sitting_id);
  assert.equal(R.nextWeekday('2026-03-06'), '2026-03-09', 'Friday → Monday');
});

test('"Did I take it?" is read off the trades of the day linked to the scenario', () => {
  assert.equal(R.tookFromTrades([{ plan_scenario: 'A', decision: 'pass' }, { plan_scenario: 'A', decision: 'take' }], 'A'), 'yes');
  assert.equal(R.tookFromTrades([{ plan_scenario: 'B', decision: 'missed' }], 'B'), 'missed');
  assert.equal(R.tookFromTrades([{ plan_scenario: 'B', decision: 'take' }], 'A'), null);
  assert.deepEqual(R.playedOf('both'), ['A', 'B']);
});

const step1 = (x: Record<string, unknown> = {}) => ({
  date: '2026-03-05T09:45', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Backtest replay',
  setup_type: 'iFVG', htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL',
  outcome: 'Win', r_multiple: null, account: 'Backtest (FX Replay)', status: 'Live', explanation: '', lesson: '',
  row_sweep: 2, row_inversion: 2, row_path: 2, row_target: 2, singular_gap: true, plan_scenario: 'A', leg_location: 'Discount', planned_rr: '2',
  decision: 'take', decided_at: '2026-11-13T11:05:00.000Z', decision_seconds: 12, decision_limit: 40, grade_override: false, ...x,
});
const save = (x: Record<string, unknown>) => { const r = parseTradeInput(step1(x)); if (!r.ok) throw new Error(r.error); return createTrade(applyRules(r.value, null)); };

test('trading without a plan: the scenario is Unplanned and the grade is capped at B; a no-bias day caps A at B too', () => {
  const noPlan = save({ plan_scenario: 'none', replay_day_id: null });
  assert.equal(noPlan.grade_letter, 'B');
  assert.equal(noPlan.replay_day_id, null);
  const day = DB.activeReplayDay()!;
  const planned = save({ replay_day_id: day.id });
  assert.equal(planned.replay_day_id, day.id);
  assert.equal(planned.grade_letter, 'A+', 'a biased day: A stays A+');
  DB.closeReplayDay(day.id, { outcome: 'A', took_a: 'yes', took_b: null, ends_sitting: false });
  const flat = DB.lockReplayDay({ replay_date: '2026-03-06', instrument: 'NQ', context: ctx({ h1Agrees: false }), scenarios: R.withDirections(ctx({ h1Agrees: false }), { a: sc({ dir: 'Long' }), b: sc({ zones: ['PDH'] }) }), at: '2026-11-13T11:30:00.000Z' });
  const capped = save({ replay_day_id: flat.id });
  assert.equal(capped.grade_letter, 'B');
  assert.match(D.gradeV2({ ...step1(), no_bias_day: true } as never).reason, /No-bias replay day/);
});

test('the trades export groups backtests under their replay day, with the plan; an amended day says so', async () => {
  const { tradesExport } = await import('../lib/tradesExport');
  const { listTrades } = await import('../db/trades');
  const days = DB.listReplayDays();
  const trades = listTrades({ pending: true }).filter((t) => t.replay_day_id);
  const doc = tradesExport({ trades: trades.map((t) => ({ ...t, explanation: t.explanation || 'x' })), shots: new Map(), replayDays: days, now: new Date('2026-11-13T12:00:00Z') });
  assert.match(doc.markdown, /### Replay day \d+ · \w{3} 2026-03-0\d/);
  assert.match(doc.markdown, /\*\*Scenario A:\*\* Long/);
  assert.match(doc.markdown, /\*\*Scenario C:\*\* Neither trigger zone/);
  const lines = R.replayDayLines(DB.listReplayDays()[0]);
  assert.match(lines.heading, /AMENDED/);
  assert.ok(lines.lines.some((l) => /Amended after locking/.test(l)));
});
