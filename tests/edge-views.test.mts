/* lib/edge/views: rolling expectancy, grade shift, exit reasons (no verdict), the live/replay gap. */
import test from 'node:test';
import assert from 'node:assert/strict';
const V = await import('../lib/edge/views');
type Trade = import('../lib/types').Trade;
const tr = (x: Record<string, unknown>) => ({ outcome: 'Win', r_multiple: 1, grade_letter: null, regrade: null, blind_grade: null, exit_reason: null, ...x }) as never as Trade;

test('rolling expectancy: one point per trade from the window on, the band around the mean', () => {
  const rs = Array.from({ length: 25 }, (_, i) => (i % 2 ? 2 : -1));
  const pts = V.rollingExpectancy(rs, 20);
  assert.equal(pts.length, 6);
  assert.equal(pts[0].i, 19);
  assert.ok(Math.abs(pts[0].mean - 0.5) < 1e-9);
  assert.ok(pts[0].lo80 < 0.5 && pts[0].hi80 > 0.5);
  assert.deepEqual(V.rollingExpectancy([1, 2, 3], 20), [], 'fewer trades than the window: nothing');
});

test('grade shift: letter counts before and after, and which way they moved', () => {
  const s = V.gradeShift([tr({ grade_letter: 'A', regrade: 'B' }), tr({ grade_letter: 'A', regrade: 'A' }), tr({ grade_letter: 'C', regrade: 'B' }), tr({ grade_letter: 'A', regrade: null })]);
  assert.equal(s.n, 3);
  assert.deepEqual(s.before, { A: 2, C: 1 });
  assert.deepEqual(s.after, { B: 2, A: 1 });
  assert.deepEqual([s.down, s.same, s.up], [1, 1, 1]);
});

test('exit reasons: counted and described, unknown apart, never given a verdict', () => {
  const x = V.exitReasons([tr({ exit_reason: 'TP', r_multiple: 2 }), tr({ exit_reason: 'TP', r_multiple: 3 }), tr({ exit_reason: 'SL', r_multiple: -1 }), tr({ exit_reason: 'Teleport', r_multiple: 1 }), tr({ outcome: 'Not taken', exit_reason: 'TP' })]);
  assert.equal(x.n, 4);
  assert.equal(x.unknown, 1);
  assert.deepEqual(x.rows.map((r) => [r.reason, r.n, r.meanR]), [['TP', 2, 2.5], ['SL', 1, -1]]);
  assert.ok(!('verdict' in x.rows[0]));
});

test('backtest gap: matched levels only, biggest gap first', () => {
  const row = (field: string, level: string, shrunk: number, n = 10, hidden = false) => ({ field, label: field, level, shrunk, n, hidden }) as never;
  const g = V.backtestGap([row('kz', 'NY', 0.2), row('kz', 'LDN', -0.4), row('tgt', 'PDH', 0.1, 10, true)], [row('kz', 'NY', 0.3), row('kz', 'LDN', 0.5), row('tgt', 'PDH', 1)]);
  assert.deepEqual(g.map((r) => r.label), ['kz = LDN', 'kz = NY']);
  assert.ok(Math.abs(g[0].gap + 0.9) < 1e-9);
});

test('underwater: zero at each new high, the distance below it otherwise', () => {
  assert.deepEqual(V.underwater([1, 3, 2, -1, 4]), [0, 0, -1, -4, 0]);
  assert.deepEqual(V.underwater([-1, -2]), [-1, -2], 'the start (0R) is the first high');
});
