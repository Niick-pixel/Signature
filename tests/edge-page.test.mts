/* Edge Engine, milestone 6: comparison, maturity, integrity, focus, the ledger, the Monte Carlo cone. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { compare } = await import('../lib/edge/compare');
const { maturity, unlocked } = await import('../lib/edge/maturity');
const { integrity } = await import('../lib/edge/integrity');
const { edgeMetrics } = await import('../lib/edge/metrics');
const { weeklyFocus } = await import('../lib/edge/focus');
const { ledgerV2 } = await import('../lib/edge/ledger');
const { tradeStates, withState } = await import('../lib/edge/state');
const { equityCone, blockStream } = await import('../lib/edge/montecarlo');
const { mulberry32 } = await import('../lib/edge/rng');

let n = 0;
const t = (x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `p${n}`, date: `2026-09-${String(1 + (n % 28)).padStart(2, '0')}T09:45`, created_at: `2026-09-01T10:${String(n % 60).padStart(2, '0')}:00.000Z`,
    account: 'Demo', status: 'Settled', outcome: 'Win', r_multiple: 1, rubric_version: 3, graded_post_hoc: false, setup_type: 'iFVG', direction: 'Long',
    mistake_tags: [], worked_tags: [], lesson: '', explanation: '', deleted_at: null, undated: false, session_index: null, exit_time: null, ...x,
  } as never;
};

test('compare: shrunk sides, P, and tier 0 keeps small samples Too early', () => {
  const a = Array(10).fill(2); const b = Array(10).fill(-1);
  const c = compare(a.map((v, i) => v + (i % 2 ? 0.1 : -0.1)), b.map((v, i) => v + (i % 2 ? 0.1 : -0.1)))!;
  assert.ok(c.shrunk < 2 && c.restShrunk > -1, 'both sides pulled toward the mean');
  assert.ok(c.pBetter > 0.99);
  assert.equal(c.verdict.level, 'hint');             // extreme gap speaks under tier 0, but Likely needs 15 a side
  const small = compare([0.5, 0.2, 0.8, 0.1, 0.3, 0.6, 0.4, 0.2, 0.5], [0.1, 0.3, 0.2, 0.0, 0.4, 0.1, 0.2, 0.3, 0.1])!;
  assert.equal(small.verdict.level, 'too-early');
  assert.equal(compare([], [1]), null);
});

test('maturity: tiers at 30, 100, 200 and trades to the next', () => {
  assert.deepEqual([0, 29, 30, 99, 100, 250].map((x) => maturity(x).tier), [0, 0, 1, 1, 2, 3]);
  assert.equal(maturity(9).toNext, 21);
  assert.equal(maturity(250).toNext, null);
  assert.equal(unlocked(maturity(40), 'ruleLab'), true);
  assert.equal(unlocked(maturity(40), 'scoreModel'), false);
});

test('integrity: clean data is silent; hindsight, missing rubric and no-R are reported', () => {
  const ok = [t({ r_multiple: 1, liquidity_event: 'PDH/PDL' }), t({ r_multiple: -1, liquidity_event: 'None' })];
  assert.deepEqual(integrity(ok, edgeMetrics(ok.map((x: { r_multiple: number }) => ({ r: x.r_multiple })))), []);
  const bad = [t({ graded_post_hoc: true }), t({ rubric_version: 0 })];
  const ids = integrity(bad, edgeMetrics(bad.map(() => ({ r: 1 }))), { noR: 2 }).map((i) => i.id);
  assert.deepEqual(ids.sort(), ['anatomy', 'hindsight', 'no-r', 'rubric']);
  // A metrics object that doesn't match its trades is flagged as a bug.
  const wrong = { ...edgeMetrics([{ r: 5 }, { r: 5 }]) };
  assert.ok(integrity(ok, wrong).some((i) => i.id === 'reconcile'));
});

test('focus: the leak is controllable and costly, the strength is never its mirror, and an unclear leak says so', () => {
  const trades = [];
  for (let d = 1; d <= 20; d++) {
    trades.push(t({ date: `2026-08-${String(d).padStart(2, '0')}T09:40`, r_multiple: d % 3 ? 1.5 : -1, worked_tags: d % 2 ? ['Waited for the close'] : [] }));
    trades.push(t({ date: `2026-08-${String(d).padStart(2, '0')}T10:40`, r_multiple: d % 4 ? -1 : 0.5 }));
  }
  const s = withState(trades, tradeStates(trades));
  const f = weeklyFocus(s, () => [], { sd: 1 });
  assert.equal(f.leak?.key, 'second-plus');
  assert.ok(f.leak!.cmp.diff < 0);
  assert.notEqual(f.strength?.key, 'first');         // the first trade is the same split, not a second finding
  assert.ok(f.experiment && f.experiment.n >= 10);
  const few = weeklyFocus(withState(trades.slice(0, 6), tradeStates(trades.slice(0, 6))), () => [], { sd: 1 });
  assert.equal(few.leakClear, false);
});

test('ledger: theme costs, repeated lessons, contradictions without self-contradiction, auto vs self', () => {
  const xs = [
    t({ r_multiple: -1, lesson: 'I entered late again, chased the move.', mistake_tags: ['Chased'] }),
    t({ r_multiple: -1, lesson: 'Late entry, chased it after the first entry was gone.' }),
    t({ r_multiple: -1, lesson: 'Chased the candle, entered late.' }),
    t({ r_multiple: 1, lesson: 'Clean trade.' }),
    t({ r_multiple: -1, lesson: "Took it before the sweep, didn't wait for the close." }),
  ];
  const l = ledgerV2(xs, (x) => ((x as { id: string }).id === (xs[0] as { id: string }).id ? [{ id: 'max-trades', short: 'At most 2', source: 'auto' }, { id: 'risk', short: 'Risk', source: 'self' }] : []));
  const late = l.themes.find((x) => x.id === 'late');
  assert.ok(late && late.n >= 3 && late.totalR < 0);
  assert.ok(l.repeated.some((r) => r.id === 'late' && r.quotes.length >= 3));
  assert.equal(l.losses.length, 4);
  assert.deepEqual(l.rules.map((r) => [r.id, r.auto, r.self]).sort(), [['max-trades', 1, 0], ['risk', 0, 1]]);
  for (const c of l.contradictions) assert.ok(!c.quotesA.some((a) => c.quotesB.some((b) => b.id === a.id)));
});

test('monte carlo: deterministic cone, ordered percentiles, block stream keeps runs, actual drawdown placed', () => {
  const rs = Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? 2.5 : i % 3 === 0 ? 0.05 : -1));
  const a = equityCone(rs, { paths: 2000 })!; const b = equityCone(rs, { paths: 2000 })!;
  assert.deepEqual(a.p50, b.p50);
  assert.equal(a.p50.length, 40);
  for (let i = 0; i < 40; i++) assert.ok(a.p05[i] <= a.p25[i] && a.p25[i] <= a.p50[i] && a.p50[i] <= a.p75[i] && a.p75[i] <= a.p95[i]);
  assert.ok(a.maxDD.p05 <= a.maxDD.p50 && a.maxDD.p50 <= 0);
  assert.ok(a.ddPercentile > 0 && a.ddPercentile <= 1);
  assert.equal(equityCone(rs.slice(0, 5)), null);
  const next = blockStream([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(1), 4);
  const draws = Array.from({ length: 8 }, next);
  assert.equal(draws[1] - draws[0] === 1 || draws[1] - draws[0] === -7, true);  // consecutive within a block (wrapping)
  // Long horizons are sampled and interpolated, still one value per trade.
  assert.equal(equityCone(rs, { paths: 300, horizon: 400 })!.p50.length, 400);
});
