/* Edge Engine, milestone 3: the field registry and its leakage firewall, similar setups, the new fields saved and kept, and the rollback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-edge-fields-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const F = await import('../lib/edge/fields');
const S = await import('../lib/edge/similar');
const A = await import('../lib/anatomy');
const { parseTradeInput } = await import('../lib/validate');

test('the leakage firewall: only pre fields predict, and every outcome and post field is kept out', () => {
  assert.ok(F.PREDICTORS.length >= 20);
  assert.ok(F.PREDICTORS.every((f) => f.timing === 'pre'));
  for (const k of ['r_multiple', 'outcome', 'mfe_bucket', 'exit_reason', 'mistake_tags', 'lesson', 'explanation', 'regrade', 'emotion_after', 'rule_breaks_manual', 'source', 'account', 'session_index']) {
    assert.ok(!F.PREDICTORS.some((f) => f.key === k), k);
  }
  // Every field has a timing, and keys are unique.
  assert.equal(new Set(F.FIELDS.map((f) => f.key)).size, F.FIELDS.length);
  // Checklist items carry the rubric's points (the prior for the learned score).
  assert.equal(F.field('chk_inversion_close')?.points, 15);
});

test('derived fields: with bias, right side of the range, killzone, closure score and letter, source', () => {
  const t = (x: Record<string, unknown>) => ({ direction: 'Long', htf_bias: 'With bias', premium_discount: 'Discount', session: 'NY AM', chk_killzone: true, ...x }) as never;
  assert.equal(F.field('with_bias')!.get(t({})), true);
  assert.equal(F.field('with_bias')!.get(t({ htf_bias: 'No bias defined' })), null);
  assert.equal(F.field('location_aligned')!.get(t({})), true);
  assert.equal(F.field('location_aligned')!.get(t({ direction: 'Short' })), false);
  assert.equal(F.field('location_aligned')!.get(t({ premium_discount: 'Equilibrium' })), null);
  assert.equal(F.field('killzone')!.get(t({ chk_killzone: false })), 'Outside');
  assert.equal(F.field('killzone')!.get(t({ session: 'NY Lunch' })), 'Outside');
  assert.equal(A.closureScore({ candle_strength: 4, inversion_speed: 3, rr_score: 2 }), 9);
  assert.equal(A.closureScore({ candle_strength: 4, inversion_speed: null, rr_score: 2 }), null);
  assert.deepEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 0].map((n) => A.closureLetter(n)), ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'C', 'F', 'F']);
  assert.deepEqual(['Live', 'Demo', 'Eval', 'Funded', 'Backtest (FX Replay)', 'Missed'].map(F.sourceOf), ['live', 'demo', 'eval', 'eval', 'backtest', 'missed']);
});

test('Gower distance: matches add 0, differences 1, numbers by range; blanks are skipped, not matches', () => {
  const fields = [F.field('direction')!, F.field('liquidity_event')!, F.field('closure_score')!];
  const a = { direction: 'Long', liquidity_event: 'PDH/PDL', candle_strength: 4, inversion_speed: 3, rr_score: 3 } as never;
  const b = { direction: 'Long', liquidity_event: 'EQH/EQL', candle_strength: 2, inversion_speed: 1, rr_score: 2 } as never;
  const g = S.gower(a, b, fields);
  assert.equal(g.shared, 3);
  assert.ok(Math.abs(g.d - (0 + 1 + 0.5) / 3) < 1e-9);
  const blank = { direction: 'Long' } as never;
  assert.deepEqual(S.gower(a, blank, fields), { d: 0, shared: 1 });
});

test('similar setups: nearest by setup only, shrunk toward the pool, a win posterior; outcome fields never matter', () => {
  let n = 0;
  const mk = (r: number, x: Record<string, unknown>) => ({ id: `s${++n}`, date: `2026-10-${String(n).padStart(2, '0')}T08:00`, r_multiple: r, setup_type: 'iFVG', screenshot_path: '',
    direction: 'Long', liquidity_event: 'PDH/PDL', entry_method: 'On inversion close', fvg_quality: 'Displacement', ...x }) as never;
  const pool = [
    ...Array.from({ length: 6 }, () => mk(2, {})),
    ...Array.from({ length: 24 }, () => mk(-1, { direction: 'Short', liquidity_event: 'None', entry_method: 'Before close (anticipation)', fvg_quality: 'Drift' })),
  ];
  const draft = { id: 'draft', direction: 'Long', liquidity_event: 'PDH/PDL', entry_method: 'On inversion close', fvg_quality: 'Displacement', exit_reason: 'SL', mistake_tags: ['Chased'] } as never;
  const s = S.similarSetups(draft, pool);
  assert.equal(s.k, 10);
  assert.equal(s.neighbours.slice(0, 6).every((x) => x.r === 2), true, 'the six identical setups come first');
  const mu = (6 * 2 - 24) / 30;
  assert.ok(Math.abs((s.shrunkR as number) - (s.n * (s.meanR as number) + 20 * mu) / (s.n + 20)) < 1e-9);
  assert.ok((s.shrunkR as number) < (s.meanR as number), 'pulled toward the pool mean');
  assert.ok((s.pWin as number) > 0.2 && (s.pWin as number) < 1);
  // A draft with almost nothing recorded finds nothing.
  assert.equal(S.similarSetups({ id: 'x', direction: 'Long' } as never, pool).n, 0);
});

test('the new fields validate, unknown values drop, and a payload without them keeps what is stored', () => {
  const base = { date: '2026-10-29T08:00', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
    htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, account: 'Backtest (FX Replay)', status: 'Settled',
    explanation: 'x'.repeat(200), lesson: 'y'.repeat(200), screenshot_path: 'a.png' };
  const ok = parseTradeInput({ ...base, liquidity_event: 'PDH/PDL', candle_strength: 9, cisd: true, entry_tf: '7m', session_index: 3, rule_breaks_manual: ['killzone', 'nope'] });
  assert.ok(ok.ok);
  const v = (ok as { value: Record<string, unknown> }).value;
  assert.deepEqual([v.liquidity_event, v.candle_strength, v.cisd, v.entry_tf, v.session_index, v.rule_breaks_manual], ['PDH/PDL', 4, true, null, 3, ['killzone']]);
  const kept = parseTradeInput({ ...base }, { previous: { explanation: base.explanation, lesson: base.lesson, stored: { session_index: 5, blind_grade: 'B' } } });
  const kv = (kept as { value: Record<string, unknown> }).value;
  assert.deepEqual([kv.session_index, kv.blind_grade], [5, 'B']);
});

test('saved and read back; the backup carries the fields and the predictions; the rollback drops only what 036 added', async () => {
  const { getDb } = await import('../db/index');
  const { createTrade, getTrade } = await import('../db/trades');
  const P = await import('../db/predictions');
  const parsed = parseTradeInput({ date: '2026-10-29T08:00', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
    htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, account: 'Demo', status: 'Settled',
    explanation: 'x'.repeat(200), lesson: 'y'.repeat(200), screenshot_path: 'a.png', liquidity_event: 'EQH/EQL', into_eq_pool: false, rule_breaks_manual: ['pd'], mfe_bucket: '2' });
  assert.ok(parsed.ok);
  const t = createTrade((parsed as { value: never }).value);
  const back = getTrade(t.id)!;
  assert.deepEqual([back.liquidity_event, back.into_eq_pool, back.rule_breaks_manual, back.mfe_bucket, back.cisd], ['EQH/EQL', false, ['pd'], '2', null]);
  P.savePrediction({ trade_id: t.id, model: 'knn-gower-v1', n: 4, mean_r: 0.5, shrunk_r: 0.1, p_win: 0.45, neighbours: ['a'] });
  assert.equal(P.listPredictions().length, 1);
  const dump = P.exportPredictions();
  getDb().exec('DELETE FROM predictions');
  assert.equal(P.restorePredictions(dump), 1);

  const { rollback } = await import('../db/cli-rollback');
  rollback('036', getDb());
  const cols = (getDb().prepare('PRAGMA table_xinfo(trades)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(!cols.includes('liquidity_event') && !cols.includes('session_index') && cols.includes('management') && cols.includes('r_multiple'));
  assert.equal((getDb().prepare("SELECT count(*) n FROM sqlite_master WHERE name = 'predictions'").get() as { n: number }).n, 0);
  assert.equal((getDb().prepare("SELECT count(*) n FROM trades WHERE id = ?").get(t.id) as { n: number }).n, 1, 'the trade itself survives');
});
