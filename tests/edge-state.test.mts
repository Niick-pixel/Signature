/* Edge Engine, milestone 5: the state of each trade, the tilt index, hesitation. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { tradeStates, withState, hesitations } = await import('../lib/edge/state');
const { tiltIndex } = await import('../lib/edge/tilt');
const { BACKTEST } = await import('../lib/domain');

let n = 0;
const t = (x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `s${n}`, date: '2026-09-08T09:45', created_at: `2026-09-08T15:${String(n).padStart(2, '0')}:00.000Z`, account: 'Demo',
    status: 'Settled', outcome: 'Win', r_multiple: 2, exit_time: null, undated: false, session_index: null, deleted_at: null,
    checklist_score: 85, trigger_fired: true, written_before_outcome: null, would_be_r: null, would_have_hit_tp: null, skip_reason: null, ...x,
  } as never;
};

test('state: trade number, losses in a row, R before, minutes since the last loss, after', () => {
  const a = t({ date: '2026-09-08T09:31', r_multiple: -1, exit_time: '09:40' });
  const b = t({ date: '2026-09-08T09:55', r_multiple: -1 });
  const c = t({ date: '2026-09-08T10:20', r_multiple: 0.05 });
  const d = t({ date: '2026-09-08T10:40', r_multiple: 1.5 });
  const e = t({ date: '2026-09-09T09:40', r_multiple: 1 });
  const s = tradeStates([d, b, e, a, c]);
  const get = (x: { id: string }) => s.get(x.id)!;
  assert.deepEqual([a, b, c, d].map((x) => get(x).tradeNo), [1, 2, 3, 4]);
  assert.deepEqual([a, b, c, d].map((x) => get(x).lossesInRowBefore), [0, 1, 2, 0]);   // a breakeven (|R| ≤ 0.10) resets the run, as in the rule book
  assert.deepEqual([a, b, c, d].map((x) => get(x).after), ['first', 'loss', 'loss', 'be']);
  assert.equal(get(d).rBefore, -1.95);
  assert.equal(get(b).minutesSinceLastLoss, 15);                                      // from the 09:40 exit, not the 09:31 entry
  assert.equal(get(e).tradeNo, 1); assert.equal(get(e).lossesInRowBefore, 0);         // a new day starts over
  assert.equal(get(a).newsConflict, false);
});

test('state: a win resets the run', () => {
  const xs = [t({ date: '2026-09-10T09:31', r_multiple: -1 }), t({ date: '2026-09-10T09:40', r_multiple: 1 }), t({ date: '2026-09-10T09:50', r_multiple: -1 }), t({ date: '2026-09-10T10:00', r_multiple: 1 })];
  const s = tradeStates(xs);
  assert.deepEqual(xs.map((x: { id: string }) => s.get(x.id)!.lossesInRowBefore), [0, 1, 0, 1]);
});

test('state: backtests carry no day state (a replay evening is not a trading day)', () => {
  const xs = [
    t({ account: BACKTEST, session_index: 4, date: '2026-10-17T20:10', r_multiple: -1 }),
    t({ account: BACKTEST, session_index: 4, date: '2026-10-17T20:20', r_multiple: -1 }),
  ];
  const s = tradeStates(xs, () => ({ redFolder: true }));
  for (const x of xs) { const st = s.get((x as { id: string }).id)!; assert.equal(st.tradeNo, null); assert.equal(st.key, null); assert.equal(st.lossesInRowBefore, null); }
  assert.equal(withState(xs, s)[1].__state?.tradeNo, null);
});

test('state: news from the day context', () => {
  const x = t({ date: '2026-09-04T09:40' });
  assert.equal(tradeStates([x], () => ({ nfpGuess: true })).get(x.id)!.newsConflict, true);
});

test('tilt: cells by losses × trade number, shrunk toward the mean; sequences only where a tilt rule broke', () => {
  const day = (d: string, rs: number[]) => rs.map((r, i) => t({ date: `2026-09-${d}T${String(9 + i).padStart(2, '0')}:40`, r_multiple: r }));
  const xs = [...day('14', [-1, -1, -1]), ...day('15', [2, 1]), ...day('16', [1]), ...day('17', [-1, 2])];
  const s = tradeStates(xs);
  const third = xs[2] as { id: string };
  const tilt = tiltIndex(xs, s, (x) => ((x as { id: string }).id === third.id ? [{ id: 'max-trades', short: 'Over 2 trades' }, { id: 'stop-after-losses', short: 'After 2 losses', source: 'auto' }, { id: 'sweep', short: 'No sweep' }] : []));
  assert.equal(tilt.cells.length, 9);
  assert.equal(tilt.cells.reduce((a, c) => a + c.n, 0), xs.length);
  const c = (l: string, k: string) => tilt.cells.find((x) => x.losses === l && x.tradeNo === k)!;
  assert.equal(c('2+', '3rd+').n, 1); assert.equal(c('0', '1st').n, 4); assert.equal(c('1', '2nd').n, 2);
  // Shrunk sits between the raw mean and the overall mean, and the empty cell sits at the mean.
  const one = c('2+', '3rd+');
  assert.ok(one.shrunk > one.rawMean! && one.shrunk < tilt.mu);
  assert.equal(c('1', '1st').n, 0); assert.equal(c('1', '1st').shrunk, tilt.mu);
  assert.ok(one.lo80 < one.shrunk && one.shrunk < one.hi80);
  assert.equal(tilt.sequences.length, 1);
  const seq = tilt.sequences[0];
  assert.equal(seq.key, '2026-09-14'); assert.equal(seq.netR, -3); assert.equal(seq.trades.length, 3);
  assert.deepEqual(seq.trades[2].rules.map((r) => r.id), ['max-trades', 'stop-after-losses']);  // non-tilt rules are left out
  assert.equal(seq.trades[2].rules[0].source, 'auto');
});

test('tilt: backtests never make a tilt sequence', () => {
  const xs = [t({ account: BACKTEST, session_index: 10, date: '2026-10-17T20:00', r_multiple: -1 }), t({ account: BACKTEST, session_index: 10, date: '2026-10-17T20:10', r_multiple: -1 })];
  const tilt = tiltIndex(xs, tradeStates(xs), () => [{ id: 'stop-after-losses', short: 'x', source: 'self' }]);
  assert.equal(tilt.sequences.length, 0);
  assert.equal(tilt.cells.reduce((a, c) => a + c.n, 0), 0);
});

test('hesitation: real-time missed setups at the threshold with the trigger; hindsight left out and counted', () => {
  const xs = [
    t({ account: 'Missed', outcome: 'Not taken', written_before_outcome: true, checklist_score: 80, would_be_r: 2.5 }),
    t({ account: 'Missed', outcome: 'Not taken', written_before_outcome: true, checklist_score: 60 }),
    t({ account: 'Missed', outcome: 'Not taken', written_before_outcome: true, checklist_score: 90, trigger_fired: false }),
    t({ account: 'Missed', outcome: 'Not taken', written_before_outcome: false, checklist_score: 95 }),
    t({ account: 'Missed', outcome: 'Not taken', written_before_outcome: null, checklist_score: 95 }),
    t({ account: 'Demo' }),
  ];
  const h = hesitations(xs);
  assert.equal(h.breaks.length, 1); assert.equal(h.breaks[0].wouldBeR, 2.5);
  assert.equal(h.hindsightLeftOut, 2);
});
