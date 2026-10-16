/* Phase 5: the honesty score, the breakdowns, rubric samples, early breakevens, and the new filters. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { honesty, breakdown, DIMENSIONS, rubricSamples, earlyBreakevens } from '../lib/questions';
import { applyStatsScope, parseStatsScope } from '../lib/statsScope';
import type { Trade } from '../lib/types';

const t = (x: Partial<Trade>): Trade => ({
  id: Math.random().toString(36), date: '2026-10-06T09:45', undated: false, account: 'Demo', outcome: 'Win', r_multiple: 2,
  status: 'Settled', graded_post_hoc: false, rubric_version: 3, target_type: 'PDH/PDL', premium_discount: 'Premium',
  confidence_at_entry: 4, target_check_passed: null, be_trigger: null, mfe_r: null, deleted_at: null, chart_date: null,
  trigger_fired: true, checklist_score: 90, session: 'NY AM', direction: 'Short',
  ...x,
} as unknown as Trade);

const trades = [
  t({}), t({ outcome: 'Loss', r_multiple: -1, graded_post_hoc: true }), t({ target_type: 'EQH/EQL', outcome: 'Loss', r_multiple: -1 }),
  t({ outcome: 'Breakeven', r_multiple: 0, mfe_r: 0.9, be_trigger: '1R' }), t({ outcome: 'Breakeven', r_multiple: 0, mfe_r: 0.3 }),
  t({ outcome: 'Not taken', r_multiple: null }), t({ rubric_version: 2, graded_post_hoc: true }),
];

test('the honesty score: taken trades graded before the outcome', () => {
  const h = honesty(trades);
  assert.equal(h.n, 6);
  assert.equal(h.preGraded, 4);
  assert.equal(h.pct, 67);
});

test('breakdowns: W/L/BE and expectancy per value', () => {
  const byTarget = breakdown(trades, DIMENSIONS.find((d) => d.id === 'target')!.key);
  const eq = byTarget.find((r) => r.key === 'EQH/EQL')!;
  assert.deepEqual([eq.n, eq.w, eq.l, eq.be, eq.expectancy], [1, 0, 1, 0, -1]);
  const pdh = byTarget.find((r) => r.key === 'PDH/PDL')!;
  assert.deepEqual([pdh.n, pdh.w, pdh.l, pdh.be], [5, 2, 1, 2]);
  assert.equal(pdh.expectancy, 0.6);
  const be = breakdown(trades, DIMENSIONS.find((d) => d.id === 'be')!.key, DIMENSIONS.find((d) => d.id === 'be')!.order);
  assert.equal(be[0].key, '1R');
});

test('rubric samples count what was graded before the outcome', () => {
  const s = rubricSamples(trades);
  assert.deepEqual(s.map((x) => [x.version, x.n, x.preGraded, x.need]), [[3, 5, 4, 50], [2, 1, 0, 50]]);
});

test('breakevens that had run 0.7R first', () => {
  const e = earlyBreakevens(trades);
  assert.equal(e.breakevens, 2);
  assert.equal(e.early.length, 1);
});

test('the scope filters by rubric and by a date range on the log day', () => {
  const scope = parseStatsScope({ account: 'Demo,Backtest (FX Replay)', rubric: '3', from: '2026-09-01', to: '2026-09-30' }, ['Demo', 'Backtest (FX Replay)']);
  assert.equal(scope.rubric, 3);
  // Backtests keep only their log time; an old chart_date is not read.
  const bt = t({ account: 'Backtest (FX Replay)', date: '2026-09-15T22:00', chart_date: '2026-08-10' });
  const late = t({ account: 'Backtest (FX Replay)', date: '2026-10-15T22:00', chart_date: '2026-09-10' });
  const inRange = applyStatsScope([...trades, bt, late, t({ date: '2026-09-05T09:45' })], scope);
  assert.equal(inRange.length, 2, 'a backtest falls on the day it was logged');
  assert.ok(inRange.includes(bt));
});
