/* Edge Engine, milestone 4: distributions, recency, shrinkage, BH, power, the firewall, the explorer on synthetic data, determinism, speed. */
import test from 'node:test';
import assert from 'node:assert/strict';
const D = await import('../lib/edge/dist');
const R = await import('../lib/edge/recency');
const { shrinkGroups } = await import('../lib/edge/shrink');
const { benjaminiHochberg } = await import('../lib/edge/bh');
const { nPerGroup } = await import('../lib/edge/power');
const X = await import('../lib/edge/explorer');
const F = await import('../lib/edge/fields');
const { genFakeTrades } = await import('../lib/edge/synthetic');
const { runEngine } = await import('../lib/edge/engine');

const close = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('distributions: normal CDF and inverse, Beta CDF and quantile, Student t', () => {
  close(D.normCdf(1.959964), 0.975, 1e-6); close(D.normCdf(0), 0.5, 1e-9); close(D.normCdf(-1), 0.158655, 1e-6);
  for (const p of [0.01, 0.1, 0.5, 0.9, 0.995]) close(D.normCdf(D.normInv(p)), p, 1e-6);
  close(D.betaCdf(0.5, 2, 3), 0.6875, 1e-9);           // 1 − (1−x)^4 − 4x(1−x)^3 at x = 0.5
  close(D.betaCdf(0.3, 1, 1), 0.3, 1e-12);
  close(D.betaInv(0.6875, 2, 3), 0.5, 1e-9);
  close(D.tTwoSided(2.228139, 10), 0.05, 1e-5);
  close(D.tTwoSided(1.959964, 1e6), 0.05, 1e-4);
  const b = D.betaPosterior(12, 8);
  assert.ok(b.lo95 < b.lo80 && b.lo80 < b.mean && b.mean < b.hi80 && b.hi80 < b.hi95);
});

test('recency: half-life weights and effective n', () => {
  const w = R.recencyWeights(121, 60);
  close(w[120], 1, 1e-12); close(w[60], 0.5, 1e-12); close(w[0], 0.25, 1e-12);
  close(R.effectiveN(new Array(30).fill(1)), 30, 1e-9);
  assert.ok(R.effectiveN(w) < 121);
  assert.deepEqual(R.recencyWeights(3, null), [1, 1, 1]);
  const m = R.weightedMoments([1, 2, 3, 4], [1, 1, 1, 1]);
  close(m.mean, 2.5, 1e-12); close(m.variance, 5 / 3, 1e-12);
});

test('shrinkage: the hand-computed case, k = 20 with fewer than 3 groups, clamps, Beta prior', () => {
  const one = (key: string, x: number[]) => ({ key, x, w: x.map(() => 1), wins: x.filter((v) => v > 0.1).length, losses: x.filter((v) => v < -0.1).length });
  const two = shrinkGroups([one('a', [2, 2, 2, 1]), one('b', [-1, -1, 0, -1, -1, -1])]);
  assert.equal(two.k, 20);
  const mu = (7 - 5) / 10;
  close(two.groups[0].shrunk, (4 * 1.75 + 20 * mu) / 24, 1e-12);
  close(two.groups[0].sd, Math.sqrt(two.sigma2 / 24), 1e-12);
  // A Beta prior worth 20 trades at the overall win rate.
  close(two.groups[0].winRate.mean, (two.pBar * 20 + 4) / (20 + 4 + 0), 1e-12);
  // Groups that do not truly differ shrink hard (k at its ceiling); groups far apart barely shrink (k at its floor).
  const flat = shrinkGroups([one('a', [1, -1, 1, -1]), one('b', [1, -1, -1, 1]), one('c', [-1, 1, 1, -1])]);
  assert.equal(flat.k, 60);
  const apart = shrinkGroups([one('a', [5, 5.1, 4.9, 5]), one('b', [0, 0.1, -0.1, 0]), one('c', [-5, -5.1, -4.9, -5])]);
  assert.equal(apart.k, 5);
});

test('Benjamini–Hochberg', () => {
  assert.deepEqual(benjaminiHochberg([0.01, 0.04, 0.03, 0.005], 0.05), [true, true, true, true]);
  assert.deepEqual(benjaminiHochberg([0.01, 0.2, 0.03, 0.5], 0.05), [true, false, false, false]);
  assert.deepEqual(benjaminiHochberg([0.3, 0.6], 0.1), [false, false]);
});

test('power: trades per group to tell a 0.5R difference', () => {
  assert.equal(nPerGroup(1, 0.5), Math.ceil(2 * (1.959964 + 0.841621) ** 2 / 0.25));
  assert.equal(nPerGroup(1, 0), Infinity);
});

test('the leakage firewall refuses any field that is not a pre predictor', () => {
  const trades = genFakeTrades(40, 3);
  for (const k of ['r_multiple', 'exit_reason', 'mistake_tags', 'lesson', 'regrade', 'source', 'grade']) {
    assert.throws(() => X.explore(trades, [F.field(k)!]), X.LeakageError, k);
  }
  assert.doesNotThrow(() => X.explore(trades));
});

const found = (n: number, seed: number, o = {}) => {
  const e = X.explore(genFakeTrades(n, seed, o), undefined, { halfLife: null });
  const row = e.rows.find((r) => r.field === 'liquidity_event' && r.level === 'None');
  return { e, row, hit: Boolean(row && row.verdict.level !== 'too-early' && row.verdict.direction === 'negative') };
};

test('synthetic: a real −0.5R effect is found at ~150 trades and is Too early at ~30', () => {
  let at150 = 0; let at30 = 0;
  for (let seed = 1; seed <= 20; seed++) { if (found(150, seed).hit) at150++; if (!found(30, seed).hit) at30++; }
  assert.ok(at150 >= 14, `found in ${at150}/20 at 150`);
  assert.ok(at30 >= 17, `too early in ${at30}/20 at 30`);
  const seed = Array.from({ length: 20 }, (_, i) => i + 1).find((s) => found(150, s).hit)!;
  const r = found(150, seed).row!;
  const raw = r.rawMean - (genFakeTrades(150, seed).filter((t) => t.liquidity_event !== 'None').reduce((a, t) => a + (t.r_multiple as number), 0) / r.restN);
  assert.ok(r.survivesBH && r.diff < 0 && Math.abs(r.diff) < Math.abs(raw), `shrunk ${r.diff.toFixed(2)} is smaller than raw ${raw.toFixed(2)}`);
  assert.ok(r.lo80 < r.shrunk && r.shrunk < r.hi80);
});

test('synthetic: with no effect at all, almost every run claims nothing', () => {
  let runs = 0;
  for (let seed = 101; seed <= 140; seed++) if (found(150, seed, { effect: 0 }).e.rows.some((r) => r.verdict.level !== 'too-early')) runs++;
  assert.ok(runs <= 4, `${runs}/40 runs made a claim`);
});

test('under 30 trades only an extreme gap can speak; tiny or zero-variance rows are hidden', () => {
  const e = X.explore(genFakeTrades(24, 9, { effect: -0.3 }), undefined, { halfLife: null });
  assert.ok(e.rows.every((r) => r.verdict.level === 'too-early'));
  assert.ok(e.rows.filter((r) => r.n < 3).every((r) => r.hidden));
});

test('the engine is deterministic and cached; 2,000 trades compute in under 300 ms', () => {
  const ts = genFakeTrades(200, 5);
  const a = runEngine(ts); const b = runEngine([...ts].reverse());
  assert.equal(a, b, 'same data in any order: the cached result');
  assert.deepEqual(JSON.parse(JSON.stringify(runEngine(ts, { window: 'recent' }).explorer.rows.map((r) => r.shrunk))),
    JSON.parse(JSON.stringify(runEngine(genFakeTrades(200, 5), { window: 'recent' }).explorer.rows.map((r) => r.shrunk))));
  const big = genFakeTrades(2000, 77);
  const t0 = performance.now(); const r = runEngine(big); const ms = performance.now() - t0;
  assert.equal(r.n, 2000);
  assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
  assert.ok(r.nFor05R != null && r.nFor05R > 0);
});
