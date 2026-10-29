/* The success system: a process score per trade from its journal entry, and whether a good process pays. */
import test from 'node:test';
import assert from 'node:assert/strict';
const S = await import('../lib/successSystem');

let n = 0;
const t = (r: number, o: Record<string, unknown> = {}) => {
  n += 1;
  return { id: `s${n}`, date: `2026-10-${String(1 + (n % 27)).padStart(2, '0')}T08:40`, setup_type: 'iFVG', direction: 'Long', account: 'Topstep 50K',
    outcome: r > 0 ? 'Win' : r < 0 ? 'Loss' : 'Breakeven', r_multiple: r, grade_letter: 'A', graded_post_hoc: false, mistake_tags: [],
    explanation: '', lesson: '', pnl_dollars: null, risk_dollars: 100, htf_bias: null, premium_discount: null, sweep_tier: 'minor', confidence_at_entry: 4, target_check_passed: null, ...o } as never;
};
const ctx = { plan: () => 'in' as const, broken: () => [] as string[] };

test('patient words count, negated ones do not', () => {
  assert.deepEqual(S.goodWords({ explanation: 'I waited for the close and it was a clean entry.', lesson: '' }), ['waited for', 'clean entry']);
  assert.deepEqual(S.goodWords({ explanation: "I didn't wait for the close.", lesson: 'No confirmation at all.' }), []);
});

test('a trade scores on the checks that apply; impulse words fail the words check', () => {
  const good = S.scoreTrade(t(2, { lesson: 'Waited for the sweep, held to the plan.' }), ctx);
  assert.equal(good.score, 100);
  const bad = S.scoreTrade(t(-1, { explanation: 'I chased the move, entered late.', mistake_tags: ['Chased'], grade_letter: 'C', graded_post_hoc: true }),
    { plan: () => 'off', broken: () => ['Outside killzone'] });
  assert.equal(bad.score, 0);
  assert.ok(bad.themes.length > 0);
  assert.equal(bad.checks.find((c) => c.id === 'rules')!.detail, 'Outside killzone');
  const noPrep = S.scoreTrade(t(1), { plan: () => null, broken: () => [] });
  assert.equal(noPrep.checks.find((c) => c.id === 'plan')!.passed, null, 'no prep: not counted');
});

test('the system: bands, the costliest habit, themes, newest first', () => {
  const ts = [
    ...[1, 2, 1.5, 2, 1].map((r) => t(r, { lesson: 'Waited for the close, as planned.' })),
    ...[-1, -1, -1].map((r) => t(r, { explanation: 'Chased it again, entered late.', mistake_tags: ['Chased'], graded_post_hoc: true, grade_letter: 'C' })),
  ];
  const s = S.successSystem(ts, { plan: (x: { mistake_tags: string[] }) => (x.mistake_tags.length ? 'off' : 'in'), broken: () => [] } as never);
  assert.equal(s.n, 8);
  const hi = s.bands.find((b) => b.id === 'high')!; const lo = s.bands.find((b) => b.id === 'low')!;
  assert.equal(hi.n, 5); assert.equal(lo.n, 3); assert.equal(lo.avgR, -1);
  assert.match(s.line, /high-scoring trades did better/);
  assert.equal(s.focus, null, 'no "matters most" call from checks written after the result');
  // A gap within two standard errors is called noise, with the trades needed.
  const noisy = S.successSystem([t(1, { lesson: 'Waited for the close.' }), t(-1, { lesson: 'Waited for the close.' }), t(0.5), t(-1, { explanation: 'Chased it.', mistake_tags: ['Chased'], graded_post_hoc: true, grade_letter: 'C' }), t(1, { explanation: 'Chased it.', mistake_tags: ['Chased'], graded_post_hoc: true, grade_letter: 'C' }), t(0.2)], ctx);
  assert.match(noisy.line, /Can't tell yet/);
  assert.equal(s.themes[0].n, 3);
  assert.equal(s.trades[0].id, ts[ts.length - 1].id);
  const plan = s.habits.find((h) => h.id === 'plan')!;
  assert.deepEqual([plan.applies, plan.kept], [8, 5]);
  assert.equal(plan.costR, 3 * (-1 - 1.5), "three broken trades at −2.5R each against kept");
});
