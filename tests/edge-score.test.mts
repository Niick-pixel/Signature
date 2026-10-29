/* Edge Engine, milestone 8: linear algebra, the Bayesian score model, walk-forward, setup quality, execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
const LA = await import('../lib/edge/linalg');
const S = await import('../lib/edge/scoreModel');
const { setupQuality } = await import('../lib/edge/quality');
const { execution } = await import('../lib/edge/execution');
const { mulberry32 } = await import('../lib/edge/rng');

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('linalg: Cholesky solve and inverse', () => {
  const A = [[4, 2, 0.6], [2, 2, 0.5], [0.6, 0.5, 3]];
  const L = LA.cholesky(A);
  const x = LA.cholSolve(L, [1, 2, 3]);
  A.forEach((row, i) => close(row.reduce((a, v, j) => a + v * x[j], 0), [1, 2, 3][i], 1e-12));
  const inv = LA.cholInverse(L);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) close(A[i].reduce((a, v, k) => a + v * inv[k][j], 0), i === j ? 1 : 0, 1e-12);
  assert.throws(() => LA.cholesky([[1, 2], [2, 1]]));
});

test('score model: the hand-computed case — λ equal to n halves the data’s effect toward a zero prior', () => {
  const f = [{ key: 'x', label: 'x', points: 0, get: () => 0 }];
  const fit = S.fitScore([[0], [1], [0], [1]], [0, 2, 0, 2], [1, 1, 1, 1], f, 4);
  // z = ±1, Σz² = 4, Σz(y − ȳ) = 4, β = 4 / (4 + 4) = 0.5; raw = β / sd = 1.0 (data says 2.0)
  close(fit.beta[0], 0.5); close(fit.intercept, 1);
  close(S.predict(fit, [1]), 1.5);
  close(S.weights(fit, 4, f)[0].learned, 1);
  // With your points as the prior, the fitted scale reproduces a one-item rubric exactly.
  const g = [{ key: 'x', label: 'x', points: 10, get: () => 0 }];
  const fg = S.fitScore([[0], [1], [0], [1]], [0, 3, 0, 3], [1, 1, 1, 1], g, 40);
  close(fg.s, 0.3); close(fg.beta0[0], 1.5); close(fg.beta[0], 1.5);
});

test('score model: the prior holds at small n and lets go at large n; s never reverses your rubric', () => {
  const f = [{ key: 'a', label: 'a', points: 10, get: () => 0 }, { key: 'b', label: 'b', points: 10, get: () => 0 }];
  const gen = (n: number, seed: number) => { const r = mulberry32(seed); const X: number[][] = []; const y: number[] = [];
    for (let i = 0; i < n; i++) { const a = r() < 0.5 ? 1 : 0; const b = r() < 0.5 ? 1 : 0; X.push([a, b]); y.push(1.0 * a - 0.0 * b + (r() - 0.5)); } return { X, y }; };
  const small = gen(20, 1); const big = gen(2000, 1);
  const ws = S.weights(S.fitScore(small.X, small.y, small.X.map(() => 1), f), 20, f);
  const wb = S.weights(S.fitScore(big.X, big.y, big.X.map(() => 1), f), 2000, f);
  // b carries nothing: at 20 trades it stays near its prior; at 2,000 the data pulls it to ~0.
  assert.ok(Math.abs(wb[1].learned) < 0.1);
  assert.ok(Math.abs(ws[1].learned - ws[1].prior) < Math.abs(wb[1].learned - wb[1].prior) + 0.5);
  assert.ok(wb[0].learned > 0.8);
  const rev = S.fitScore([[0], [1], [0], [1]], [2, 0, 2, 0], [1, 1, 1, 1], [{ key: 'x', label: 'x', points: 10, get: () => 0 }], 40);
  assert.equal(rev.s, 0);
});

test('spearman: perfect, reversed, ties', () => {
  close(S.spearman([1, 2, 3, 4], [10, 20, 30, 40])!, 1);
  close(S.spearman([1, 2, 3, 4], [4, 3, 2, 1])!, -1);
  assert.equal(S.spearman([1, 1, 1], [1, 2, 3]), null);
});

let n = 0;
const t = (x: Record<string, unknown>) => { n += 1; return { id: `s${n}`, date: `2026-01-01T${String(n % 24).padStart(2, '0')}:00`, graded_post_hoc: false, checklist_score: 70, ...x } as never; };

test('walk-forward: an injected effect is found out of sample at 300 trades; hindsight-graded trades are never scored', () => {
  const r = mulberry32(42);
  const trades = Array.from({ length: 300 }, () => { const inv = r() < 0.5; const kz = r() < 0.5;
    return t({ chk_inversion_close: inv, chk_killzone: kz, r_multiple: (inv ? 0.8 : -0.4) + (r() - 0.5) * 2 }); });
  const wf = S.walkForward(trades)!;
  assert.equal(wf.n, 280);
  assert.ok(wf.model.rho! > 0.15 && wf.model.lo80! > 0, `rho ${wf.model.rho}`);
  assert.ok(wf.model.mseSkill! > 0);
  assert.ok(wf.calibration.length === 5 && wf.calibration[4].realized > wf.calibration[0].realized);
  const exposed = trades.map((x, i) => ({ ...(x as object), graded_post_hoc: i % 2 === 0 })) as never[];
  const we = S.walkForward(exposed)!;
  assert.equal(we.n + we.skippedExposed, 280);
  assert.equal(we.skippedExposed, 140);
});

test('walk-forward: each step equals a full refit on the trades before it', () => {
  const r = mulberry32(7);
  const trades = Array.from({ length: 30 }, () => t({ chk_inversion_close: r() < 0.5, chk_htf_bias: r() < 0.6, sweep_tier: r() < 0.5 ? 'major' : 'none', r_multiple: r() * 3 - 1 }));
  const wf = S.walkForward(trades)!;
  const X = S.design(trades);
  for (const k of [20, 25, 29]) {
    const fit = S.fitScore(X.slice(0, k), trades.slice(0, k).map((x: { r_multiple: number }) => x.r_multiple));
    close(wf.preds[k - 20], S.predict(fit, X[k]), 1e-6);
  }
});

test('setup quality: clean and exposed apart, drift on one scale', () => {
  const xs = [t({ grade_letter: 'A', r_multiple: 1, regrade: 'B' }), t({ grade_letter: 'A', r_multiple: -1, regrade: 'A' }), t({ grade_letter: 'C', r_multiple: 2, graded_post_hoc: true, regrade: 'B', blind_grade: 'A' })];
  const q = setupQuality(xs);
  assert.equal(q.cleanN, 2); assert.equal(q.exposedN, 1);
  assert.deepEqual(q.clean.rows.map((r) => r.grade), ['A']);
  const d = q.drift.find((x) => x.against === 'regrade')!;
  assert.equal(d.n, 3); assert.equal(d.down, 1); assert.equal(d.up, 1); assert.equal(d.same, 1);
  assert.equal(q.drift.find((x) => x.against === 'blind')!.n, 1);
});

test('execution: management leak, never positive, stop barely held, early BE cost, efficiency', () => {
  const xs = [
    t({ r_multiple: -1, mfe_bucket: '1.5' }), t({ r_multiple: -1, mfe_bucket: '0' }), t({ r_multiple: -1, mfe_r: 0.3 }),
    t({ r_multiple: 2, mae_bucket: '~1', mfe_r: 4 }), t({ r_multiple: 0, moved_to_be: 'After 1R', exit_reason: 'BE stop', target_hit_later: 'Yes', planned_rr: '3' }),
    t({ r_multiple: 2.9, planned_rr: '3' }),
  ];
  const e = execution(xs);
  assert.equal(e.mgmtLeak.length, 1); assert.equal(e.neverPositive.length, 1); assert.equal(e.losersWithMfe, 3);
  assert.equal(e.stopSurvived.length, 1);
  assert.equal(e.earlyBe.costR, 3);
  close(e.efficiency.mean!, 0.5);
  assert.deepEqual(e.planned, [{ rr: '3', n: 2, reached: 1, meanR: 1.45 }]);
});

test('score model: only pre-trade inputs (firewall), and fast at 2,000 trades', async () => {
  const { FIELDS } = await import('../lib/edge/fields');
  const pre = new Set(FIELDS.filter((f) => f.timing === 'pre').map((f) => f.key));
  const derivedPre = new Set(['sweep_tier', 'singular_gap', 'closure_score', 'liquidity_event', 'target_named', 'with_bias', 'location_aligned', 'killzone_in']);
  for (const f of S.SCORE_FEATURES) assert.ok(pre.has(f.key) || derivedPre.has(f.key), `${f.key} must be known before the entry`);
  const r = mulberry32(3);
  const many = Array.from({ length: 2000 }, () => t({ chk_inversion_close: r() < 0.5, chk_killzone: r() < 0.5, sweep_tier: r() < 0.5 ? 'major' : 'minor', r_multiple: r() * 3 - 1 }));
  const t0 = performance.now(); const m = S.scoreModel(many); const ms = performance.now() - t0;
  assert.ok(m && m.wf && m.wf.n === 1980);
  assert.ok(ms < 3000, `${ms} ms`);
});
