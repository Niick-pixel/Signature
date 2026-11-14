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
const { createTrade, getTrade } = await import('../db/trades');
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

test('weekly levels and major swings: each on its side, as zones and targets; the Sweep row names them', () => {
  assert.ok(R.zoneOptions('Short', 'None').includes('PWH') && R.zoneOptions('Short', 'None').includes('Major swing high'));
  assert.ok(!R.zoneOptions('Short', 'None').includes('PWL') && !R.zoneOptions('Short', 'None').includes('Major swing low'));
  assert.ok(R.zoneOptions('Long', 'None').includes('PWL') && R.zoneOptions('Long', 'None').includes('Major swing low'));
  assert.ok(R.zoneOptions(null, 'None').includes('PWH/PWL') && R.zoneOptions(null, 'None').includes('Major swing H/L'));
  assert.ok(R.targetOptions('None').includes('PWH/PWL') && R.targetOptions('None').includes('Major swing H/L'));
  assert.match(R.MAJOR_SWING_HELP, /1H\+ swing that started a displacement leg/);
  assert.match(D.ROWS[0].defs[2], /PWH\/PWL.*major swing high\/low/);
  assert.ok(D.V2_TARGETS.some((t) => t.label === 'PWH/PWL' && t.value === 'Weekly high/low'));
  assert.ok(D.V2_TARGETS.some((t) => t.value === 'Major swing H/L'));
  // A plan with them parses back as it was.
  const c = ctx({ taken: [] });
  const s = R.parseScenarios({ a: sc({ zones: ['PWL', 'Major swing low'], target: 'Major swing H/L' }), b: sc({ zones: ['PWH'], target: 'PWH/PWL' }) }, c);
  assert.deepEqual([s.a.zones, s.a.target, s.b.zones, s.b.target], [['PWL', 'Major swing low'], 'Major swing H/L', ['PWH'], 'PWH/PWL']);
});

test('taken before the open: never a zone, never a target on that side; overnight follows; the plan lets go; copy asks again', () => {
  assert.equal(R.overnightOf([]), 'Neither');
  assert.equal(R.overnightOf(['Asia low', 'PDL']), 'Lows run');
  assert.equal(R.overnightOf(['Asia high', 'London low']), 'Both');
  const taken = ['Asia low', 'PDL', 'PWH'];
  const long = R.zoneOptions('Long', 'None', taken);
  assert.ok(!long.includes('Asia low') && !long.includes('PDL') && long.includes('London low') && long.includes('PWL'));
  assert.ok(!R.zoneOptions('Short', 'None', taken).includes('PWH'));
  // A long aims above: PWH run, so PWH/PWL is gone for a long, still there for a short (PWL untouched).
  assert.ok(!R.targetOptions('None', 'Long', taken).includes('PWH/PWL'));
  assert.ok(R.targetOptions('None', 'Short', taken).includes('PWH/PWL'));
  assert.ok(!R.targetOptions('None', 'Short', taken).includes('PDH/PDL'), 'a short aims at PDL — run');
  assert.ok(R.targetOptions('None', 'Short', ['Asia low']).includes('Session H/L'), 'one session low left is still a target');
  assert.ok(!R.targetOptions('None', 'Short', ['Asia low', 'London low']).includes('Session H/L'));
  // The plan follows: a picked zone or target that is now taken is let go.
  const c = ctx({ taken });
  const tidy = R.tidyScenarios(c, R.withDirections(c, { a: sc({ zones: ['PDL', 'London low'], target: 'PWH/PWL' }), b: sc({ zones: ['PDH'] }) }));
  assert.deepEqual(tidy.a.zones, ['London low']);
  assert.equal(tidy.a.target, null);
  assert.ok(R.lockMissing(c, { a: sc({ zones: ['PDL'] }), b: sc({ zones: ['PDH'] }) }).includes('A: trigger zone'), 'a taken zone does not count');
  // Not answered: owed. Parsed: overnight from the taps.
  assert.ok(R.lockMissing(ctx({ overnight: null, taken: null }), { a: sc(), b: sc({ zones: ['PDH'] }) }).includes('taken before the open'));
  assert.equal(R.parseContext({ ...ctx(), taken: ['PDH', 'nonsense'] }).overnight, 'Highs run');
  assert.deepEqual(R.parseContext({ ...ctx(), taken: ['PDH', 'nonsense'] }).taken, ['PDH']);
  // Copy last day: the plan, never yesterday's taken levels.
  const copy = R.copyPlan({ context: ctx({ taken: ['PDH'] }), scenarios: { a: sc(), b: sc() } });
  assert.equal(copy.context.taken, null);
  assert.equal(copy.context.overnight, null);
});

test('replay plans in Stats count the new zones like any other', async () => {
  const { replayStats } = await import('../lib/replayStats');
  const day = { ...R.emptyScenarios(), id: 'd1', closed_at: 'x', outcome: 'A', amended_at: null, scenarios: { a: sc({ zones: ['Major swing low', 'PWL'] }), b: sc({ zones: ['PWH'] }) } } as never;
  const { BACKTEST } = await import('../lib/domain');
  const trade = { id: 't', account: BACKTEST, decision: 'take', r_multiple: 2, replay_day_id: 'd1', deleted_at: null, plan_scenario: 'A' } as never;
  const z = replayStats([day], [trade]).zones;
  assert.deepEqual(z.map((x) => x.label).sort(), ['Major swing low', 'PWH', 'PWL']);
  assert.ok(z.every((x) => x.win === 1));
});

test('a wrong replay date is put right: the day and its trades move, the plan is not amended', () => {
  const last = DB.lastReplayDay();
  if (last && !last.closed_at) DB.closeReplayDay(last.id, { outcome: 'C', took_a: null, took_b: null, ends_sitting: true });
  const d = DB.lockReplayDay({ replay_date: '2026-11-13', instrument: 'NQ', context: ctx({ taken: [] }), scenarios: { a: sc(), b: sc({ zones: ['PDH'] }) } });
  const t = save({ date: '2026-11-13T09:45', replay_day_id: d.id });
  const moved = DB.redateReplayDay(d.id, '2023-09-12');
  assert.deepEqual([moved.replay_date, moved.weekday, moved.amended_at], ['2023-09-12', 'Tue', null]);
  assert.equal(getTrade(t.id)!.date, '2023-09-12T09:45');
  assert.throws(() => DB.redateReplayDay(d.id, 'soon'), /YYYY-MM-DD/);
});

test('backtests on no replay day move by the day they were logged, in one go: two groups can even swap days', async () => {
  const { BACKTEST } = await import('../lib/domain');
  const mk = (date: string) => { const r = parseTradeInput({ ...step1(), account: BACKTEST, date, replay_day_id: null }); if (!r.ok) throw new Error(r.error); return createTrade(applyRules(r.value, null)); };
  const a = mk('2026-11-02T09:45'); const b = mk('2026-11-03T10:10');
  const before = DB.looseBacktestDays();
  assert.ok(before.some((g) => g.day === '2026-11-02') && before.some((g) => g.day === '2026-11-03'));
  // A swap: the 2nd's trades to the 3rd and the 3rd's to the 2nd — picked before moved, so neither drags the other along.
  DB.redateLooseBacktests([{ from: '2026-11-02', to: '2026-11-03' }, { from: '2026-11-03', to: '2026-11-02' }]);
  assert.equal(getTrade(a.id)!.date.slice(0, 16), '2026-11-03T09:45');
  assert.equal(getTrade(b.id)!.date.slice(0, 16), '2026-11-02T10:10');
  DB.redateLooseBacktests([{ from: '2026-11-03', to: '2023-09-12' }]);
  assert.equal(getTrade(a.id)!.date.slice(0, 16), '2023-09-12T09:45', 'time of day kept');
  assert.throws(() => DB.redateLooseBacktests([{ from: 'x', to: '2023-09-12' }]), /YYYY-MM-DD/);
});
