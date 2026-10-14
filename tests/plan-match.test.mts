/*
  Did I trade my plan? Each trade against that morning's chart prep: side,
  sweep and target, each compared only when both sides answered it.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { planMatch, planSplit, planDay, nyMinutes } from '../lib/planMatch';
import type { Trade } from '../lib/types';

const prep = (answers: Record<string, string | string[]>) => ({ steps: {}, ticks: {}, answers });
const t = (o: Partial<Trade> = {}) => ({
  id: Math.random().toString(36), account: 'Live', undated: false, date: '2026-10-13T09:50', direction: 'Short',
  sweep_level: 'PDH', target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, ...o,
}) as Trade;

test('in the plan when everything that was planned agrees', () => {
  const m = planMatch(t(), prep({ 'draw.side': 'Shorts only', 'liquidity.wait': ['PDH', 'Asia high'], 'draw.target': 'PDH/PDL' }));
  assert.equal(m.status, 'in');
  assert.equal(m.agreed.length, 3);
});

test('off plan names what differed', () => {
  const m = planMatch(t({ direction: 'Long', sweep_level: 'EQL' }), prep({ 'draw.side': 'Shorts only', 'liquidity.wait': ['PDH'], 'draw.target': 'PDH/PDL' }));
  assert.equal(m.status, 'off');
  assert.deepEqual(m.diffs, ['planned shorts only, took a long', 'swept EQL, planned PDH']);
  assert.equal(planMatch(t(), prep({ 'draw.side': 'No trade today' })).diffs[0], 'planned no trade today');
});

test('no plan: no prep, nothing comparable, a backtest or an undated trade', () => {
  assert.equal(planMatch(t(), null).status, 'none');
  assert.equal(planMatch(t(), prep({ 'bias.bias': 'Bearish' })).status, 'none');
  assert.equal(planMatch(t({ account: 'Backtest (FX Replay)' }), prep({ 'draw.side': 'Longs only' })).status, 'none');
  assert.equal(planMatch(t({ undated: true }), prep({ 'draw.side': 'Longs only' })).status, 'none');
  // A trade with no sweep recorded is not compared on the sweep.
  assert.equal(planMatch(t({ sweep_level: null }), prep({ 'liquidity.wait': ['PDH'] })).status, 'none');
  assert.equal(planDay(t()), '2026-10-13');
});

test('the split sums R per status and counts why trades went off plan', () => {
  const day = new Map([['2026-10-13', prep({ 'draw.side': 'Shorts only' })]]);
  const { rows, reasons } = planSplit([
    t({ r_multiple: 2 }),
    t({ direction: 'Long', outcome: 'Loss', r_multiple: -1 }),
    t({ date: '2026-10-12T09:50', outcome: 'Loss', r_multiple: -1 }),
    t({ outcome: 'Not taken', r_multiple: null }),
  ], day);
  assert.deepEqual(rows.map((r) => [r.key, r.taken, r.totalR]), [['in', 1, 2], ['off', 1, -1], ['none', 1, -1]]);
  assert.deepEqual(reasons, [['Wrong side', 1]]);
});

test('times: Costa Rica entries converted to New York, across the clock change', () => {
  // October (New York on EDT, UTC−4): Costa Rica 07:50 is 09:50 in New York.
  assert.equal(nyMinutes('2026-10-13T07:50'), 9 * 60 + 50);
  // December (New York on EST, UTC−5): Costa Rica 08:50 is 09:50 in New York.
  assert.equal(nyMinutes('2026-12-08T08:50'), 9 * 60 + 50);
  const plan = prep({ 'session.first': 'After 9:45', 'session.done': '11:00' });
  // 07:40 CR in October is 9:40 NY — before the planned first entry.
  assert.deepEqual(planMatch(t({ date: '2026-10-13T07:40' }), plan).diffs, ['entered 9:40 NY, planned from 9:45']);
  // 09:30 CR is 11:30 NY — past "done by 11:00".
  assert.deepEqual(planMatch(t({ date: '2026-10-13T09:30' }), plan).diffs, ['entered 11:30 NY, planned done by 11:00']);
  // 08:05 CR is 10:05 NY — inside the window.
  const ok = planMatch(t({ date: '2026-10-13T08:05' }), plan);
  assert.equal(ok.status, 'in');
  assert.deepEqual(ok.agreed, ['time (10:05 NY)']);
  // "15 min after the news" cannot be checked without the release time.
  assert.equal(planMatch(t(), prep({ 'session.first': '15 min after the news' })).status, 'none');
  // And it is counted as its own reason.
  const { reasons } = planSplit([t({ date: '2026-10-13T07:40' })], new Map([['2026-10-13', plan]]));
  assert.deepEqual(reasons, [['Outside planned hours', 1]]);
});
