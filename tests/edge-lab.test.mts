/* Edge Engine, milestone 7: the Rule Lab and the eval simulator. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { labRows, labResult, tradesPerDay, LAB_FILTERS } = await import('../lib/edge/ruleLab');
const { evalSim } = await import('../lib/edge/montecarlo');
const { tradeStates, withState } = await import('../lib/edge/state');

let n = 0;
const t = (x: Record<string, unknown> = {}) => {
  n += 1;
  return { id: `l${n}`, date: '2026-08-03T09:40', created_at: `2026-08-01T10:${String(n % 60).padStart(2, '0')}:00.000Z`, account: 'Demo', r_multiple: 1, status: 'Settled',
    htf_bias: 'With bias', entry_method: null, liquidity_event: null, target_type: null, chk_killzone: true, grade_letter: 'A', deleted_at: null, undated: false, session_index: null, exit_time: null, ...x } as never;
};
const day = (d: number, rs: number[], x: Record<string, unknown> = {}) => rs.map((r, i) => t({ date: `2026-08-${String(d).padStart(2, '0')}T${String(9 + i).padStart(2, '0')}:40`, r_multiple: r, ...x }));

test('rule lab: unknown is kept, day filters follow the order of the day', () => {
  const xs = [...day(3, [-1, 2, -1]), ...day(4, [1, -1, -1]), ...day(5, [2], { htf_bias: 'Against bias' }), ...day(6, [1], { htf_bias: null })];
  const rows = labRows(withState(xs, tradeStates(xs)), () => []);
  const kept = (f: string) => rows.filter((r) => r.keep[f]).map((r) => r.r);
  assert.deepEqual(kept('stop-first-loss'), [-1, 1, -1, 2, 1]);     // after a loss, nothing else that day
  assert.deepEqual(kept('one-after-loss'), [-1, 2, 1, -1, -1, 2, 1]); // one more trade after the first loss
  assert.deepEqual(kept('max-2'), [-1, 2, 1, -1, 2, 1]);
  assert.equal(rows.filter((r) => !r.keep['with-bias']).length, 1);
  assert.equal(rows.filter((r) => r.unknown['with-bias']).length, 1);  // never recorded: kept, and counted
  assert.ok(LAB_FILTERS.every((f) => rows.every((r) => typeof r.keep[f.id] === 'boolean')));
});

test('rule lab: result arithmetic, deterministic P(improvement), aligned curve, walk-forward from 60', () => {
  const xs = Array.from({ length: 40 }, (_, i) => day(1 + (i % 28), [i % 2 ? 1.5 : -1], { htf_bias: i % 4 === 1 ? 'Against bias' : 'With bias' })[0]);
  const rows = labRows(withState(xs, tradeStates(xs)), () => []);
  const a = labResult(rows, ['with-bias']); const b = labResult(rows, ['with-bias']);
  assert.equal(a.pImprove, b.pImprove);
  assert.equal(a.kept + a.removed, 40);
  assert.equal(a.curve.length, 40);
  assert.ok(Math.abs(a.curve[39] - a.metrics.netR) < 1e-9);
  assert.ok(a.delta! < 0 && a.pImprove! < 0.5);                       // removing winners makes it worse, and says so
  assert.equal(a.laterHalf, null);
  const many = Array.from({ length: 80 }, (_, i) => t({ date: `2026-0${1 + (i % 8)}-1${i % 9}T09:40`, r_multiple: i % 3 ? 1 : -1, grade_letter: i % 3 ? 'A' : 'C' }));
  const r2 = labResult(labRows(withState(many, tradeStates(many)), () => []), ['a-grade']);
  assert.ok(r2.laterHalf && r2.laterHalf.delta > 0);
  assert.ok(r2.testN! >= 10);
  assert.deepEqual(tradesPerDay(rows).reduce((s, v) => s + v, 0), 40);
});

test('eval simulator: a sure winner passes, a sure loser busts, daily loss and min days apply', () => {
  const rules = { start: 50000, target: 3000, maxDrawdown: 2000, drawdown: 'static' as const, trailLock: null, dailyLoss: null, minDays: null, risk: 500 };
  const win = evalSim(Array(20).fill(1), rules, { paths: 500 })!;
  assert.equal(win.pPass, 1); assert.equal(win.medianTrades, 6);
  const lose = evalSim(Array(20).fill(-1), rules, { paths: 500 })!;
  assert.equal(lose.pBust, 1);
  assert.equal(evalSim(Array(20).fill(-1), { ...rules, dailyLoss: 900 }, { paths: 200, tradesPerDay: [2] })!.bustBy.daily, 1);
  assert.equal(evalSim(Array(20).fill(1), { ...rules, minDays: 10 }, { paths: 200 })!.medianDays, 10);
  // Trailing: a run up then down busts sooner than static.
  const swing = [3, 3, -1, -1, -1, -1, -1, -1, -1, -1, 3, 3];
  const st = evalSim(swing, { ...rules, target: 1e6 }, { paths: 2000, maxDays: 40 })!;
  const tr = evalSim(swing, { ...rules, target: 1e6, drawdown: 'intraday_trailing' }, { paths: 2000, maxDays: 40 })!;
  assert.ok(tr.pBust >= st.pBust);
  assert.equal(evalSim(Array(5).fill(1), rules), null);
  assert.deepEqual(evalSim(swing, rules, { paths: 300 }), evalSim(swing, rules, { paths: 300 }));
});
