/* Edge Engine, milestone 2: the canonical metrics, reconciled, with the golden fixture of the avg-win bug. */
import test from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../lib/edge/metrics');
const { bootstrapMean } = await import('../lib/edge/bootstrap');
const { mulberry32, hashString } = await import('../lib/edge/rng');
const { edge, aggregate } = await import('../lib/stats');

const close = (a: number | null, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

/*
  The screen: 11W / 15L / 8BE, avg win shown +1.03R, PF 1.30, net +4.5R.
  Gross loss 15R, gross win 19.5R. Breakevens here carry +0.05R each (+0.4R),
  so the 11 wins hold 19.1R — avg win 1.736R. The old code divided 19.5R by 19.
*/
const golden = [
  ...Array.from({ length: 11 }, (_, i) => ({ r: i < 10 ? 1.7 : 2.1 })),   // 17 + 2.1 = 19.1R
  ...Array.from({ length: 15 }, () => ({ r: -1 })),                       // −15R
  ...Array.from({ length: 8 }, () => ({ r: 0.05 })),                      // +0.4R, all breakevens
];

test('golden fixture: avg win over wins only; the screen numbers reproduce', () => {
  const m = M.edgeMetrics(golden);
  assert.deepEqual([m.n, m.wins, m.losses, m.be], [34, 11, 15, 8]);
  close(m.netR, 4.5); close(m.grossWin, 19.5); close(m.grossLoss, 15);
  close(m.profitFactor, 1.3);
  close(m.avgWin, 19.1 / 11);
  assert.ok(Math.abs((m.avgWin as number) - 19.5 / 19) > 0.5, 'not the old wins+BE average');
  close(m.avgLoss, -1);
  close(m.winRate, 11 / 26);
  close(m.breakevenWinRate, 1 / (19.1 / 11 + 1));
});

test('the old code path is fixed too: lib/stats edge() and aggregate() use R classes', () => {
  const trades = golden.map((x, i) => ({ id: `g${i}`, date: `2026-10-${String(1 + (i % 27)).padStart(2, '0')}T09:00`, outcome: x.r > 0.1 ? 'Win' : x.r < -0.1 ? 'Loss' : 'Breakeven', r_multiple: x.r })) as never[];
  close(edge(trades).avgWinR, 19.1 / 11);
  const a = aggregate(trades);
  assert.deepEqual([a.wins, a.losses, a.breakeven], [11, 15, 8]);
  // A hand label that disagrees with the R: R decides.
  const mislabeled = [{ id: 'x', date: '2026-10-01T09:00', outcome: 'Breakeven', r_multiple: 0.65 }, { id: 'y', date: '2026-10-02T09:00', outcome: 'Win', r_multiple: 0.06 }] as never[];
  const b = aggregate(mislabeled);
  assert.deepEqual([b.wins, b.breakeven], [1, 1]);
});

test('result classes: |R| ≤ 0.10 is breakeven, the edges included', () => {
  assert.deepEqual([0.11, 0.1, 0, -0.1, -0.11].map((r) => M.resultClass(r)), ['W', 'BE', 'BE', 'BE', 'L']);
  assert.equal(M.resultClass(0.15, 0.2), 'BE');
});

test('reconciliation: net = ΣR = expectancy × n = equity endpoint; W+L+BE = n; PF from the gross sums', () => {
  const rand = mulberry32(7);
  for (let k = 0; k < 50; k++) {
    const rows = Array.from({ length: 5 + Math.floor(rand() * 80) }, () => ({ r: Math.round((rand() * 5 - 1.6) * 100) / 100, money: rand() < 0.8 ? Math.round(rand() * 400 - 150) : null }));
    const m = M.edgeMetrics(rows, { resamples: 200 });
    const sum = rows.reduce((s, x) => s + x.r, 0);
    close(m.netR, sum, 1e-6);
    close((m.expectancy as number) * m.n, sum, 1e-6);
    close(M.equity(rows).at(-1) as number, sum, 1e-6);
    assert.equal(m.wins + m.losses + m.be, m.n);
    if (m.grossLoss > 0) close(m.profitFactor, m.grossWin / m.grossLoss, 1e-9);
    close(m.grossWin - m.grossLoss, sum, 1e-6);
    // Slices sum to their parent.
    const a = M.edgeMetrics(rows.slice(0, Math.floor(rows.length / 2)), { resamples: 50 });
    const b = M.edgeMetrics(rows.slice(Math.floor(rows.length / 2)), { resamples: 50 });
    assert.equal(a.n + b.n, m.n); assert.equal(a.wins + b.wins, m.wins); assert.equal(a.be + b.be, m.be);
    close(a.netR + b.netR, m.netR, 1e-6);
    const priced = rows.filter((x) => x.money != null);
    assert.equal(m.pricedN, priced.length);
  }
});

test('drawdown, losing streak, recovery', () => {
  const m = M.edgeMetrics([1, -1, -1, -1, 0.05, -1, 2, 2, 1].map((r) => ({ r })), { resamples: 50 });
  close(m.maxDrawdownR, -3.95, 1e-9);
  assert.equal(m.longestLosingStreak, 4, 'a breakeven does not break a losing streak');
  assert.equal(m.recoveryTrades, 2, 'back to the old peak two trades after the trough');
  assert.equal(M.edgeMetrics([{ r: 1 }, { r: -2 }]).stillUnderwater, true);
});

test('Wilson interval and trades-for-95%', () => {
  const w = M.wilson(11, 26)!;
  close(w.lo, 0.25544, 1e-4); close(w.hi, 0.61052, 1e-4);
  assert.equal(M.wilson(0, 0), null);
  const m = M.edgeMetrics(golden);
  close(m.tradesFor95, Math.ceil((1.645 * (m.sd as number) / (m.expectancy as number)) ** 2));
  assert.equal(M.edgeMetrics([{ r: -1 }, { r: 0.5 }, { r: -1 }]).tradesFor95, null, 'no target when the edge is not positive');
});

test('bootstrap is deterministic: same data, same interval; different data, different seed', () => {
  const xs = golden.map((x) => x.r);
  const a = bootstrapMean(xs)!; const b = bootstrapMean(xs)!;
  assert.deepEqual(a, b);
  assert.ok(a.lo95 < a.lo80 && a.lo80 < a.mean && a.mean < a.hi80 && a.hi80 < a.hi95);
  assert.ok(a.pPositive > 0.5 && a.pPositive < 1);
  assert.notEqual(hashString('a'), hashString('b'));
  assert.equal(bootstrapMean([1]), null);
});

test('adherence: one definition — no plan break', () => {
  const ts = [{ b: [] }, { b: ['x'] }, { b: [] }];
  assert.deepEqual(M.adherence(ts, (t) => t.b), { kept: 2, n: 3, rate: 2 / 3 });
});
