/* The three studies: targets, management replayed, why A grades lose. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { targetScorecard, managementLab, gradePredictors, PLANS } = await import('../lib/lab');

let n = 0;
const t = (x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `l${n}`, date: `2026-10-${String(1 + (n % 27)).padStart(2, '0')}T09:45`, created_at: '2026-10-01T15:00:00.000Z',
    account: 'Demo', status: 'Settled', outcome: 'Win', r_multiple: 2, target_type: 'PDH/PDL', target_hit: null, mfe_r: 2,
    sweep_tier: 'major', grade_letter: 'A', direction: 'Long', premium_discount: 'Discount', confidence_at_entry: 4,
    chk_htf_bias: true, chk_killzone: true, chk_no_news: true, singular_gap: true, chk_displacement_fvg: true,
    chk_targets_clear: true, chk_clean_path: true, chk_returned_to_fvg: true, chk_inversion_close: true,
    mistake_tags: [], worked_tags: [], explanation: '', lesson: '', deleted_at: null, ...x,
  } as never;
};

test('target scorecard: reached rate, how far it ran, swept vs not', () => {
  const rows = targetScorecard([
    t({ target_type: 'EQH/EQL', outcome: 'Loss', r_multiple: -1, mfe_r: 0.2 }),
    t({ target_type: 'EQH/EQL', outcome: 'Loss', r_multiple: -1, mfe_r: 0.4, sweep_tier: 'none' }),
    t({ target_type: 'Data wick', outcome: 'Win', r_multiple: 1.5, mfe_r: 1.5 }),
    t({ target_type: 'EQH/EQL', outcome: 'Breakeven', r_multiple: 0, target_hit: true, mfe_r: 1 }),
  ]);
  assert.equal(rows[0].target, 'Data wick');
  const eq = rows.find((r) => r.target === 'EQH/EQL')!;
  assert.deepEqual([eq.n, eq.reached, eq.avgMaxR, eq.swept.n, eq.notSwept.avgR], [3, 1, 0.53, 2, -1]);
  assert.ok(eq.early);
});

test('management lab: each plan replayed; flat exits are a range, not a guess', () => {
  const sim = (id: string, x: Record<string, unknown>) => PLANS.find((p) => p.id === id)!.sim(t(x), (x.mfe_r as number) ?? 2);
  assert.equal(sim('be1r', { outcome: 'Loss', r_multiple: -1, mfe_r: 1.2 }), 0, 'a loser that reached 1R is a scratch');
  assert.equal(sim('partial1r', { outcome: 'Win', r_multiple: 3, mfe_r: 3 }), 2);
  assert.equal(sim('tp1', { outcome: 'Loss', r_multiple: -1, mfe_r: 1.1 }), 1);
  assert.equal(sim('hold', { outcome: 'Breakeven', r_multiple: 0, mfe_r: 0.5 }), null);
  const lab = managementLab([
    ...Array.from({ length: 5 }, () => t({ outcome: 'Loss', r_multiple: -1, mfe_r: 0.2 })),
    t({ outcome: 'Breakeven', r_multiple: 0, mfe_r: 0.5 }),
  ]);
  assert.equal(lab.verdict, 'entries');
  assert.equal(lab.reached1R, 0);
  const hold = lab.plans.find((p) => p.id === 'hold')!;
  assert.deepEqual([hold.netR, hold.unsure, hold.worst, hold.best], [-5, 1, -6, -5]);
  // Losers that ran past 1R: breakeven at 1R would have saved them.
  const leak = managementLab(Array.from({ length: 10 }, () => t({ outcome: 'Loss', r_multiple: -1, mfe_r: 1.5 })));
  assert.equal(leak.verdict, 'management');
});

test('why A grades lose: same boxes, what losers share, a gate tested on history', () => {
  const ts = [
    ...Array.from({ length: 6 }, () => t({ target_type: 'EQH/EQL', outcome: 'Loss', r_multiple: -1, lesson: 'I entered too soon.' })),
    ...Array.from({ length: 6 }, () => t({ target_type: 'Data wick' })),
    ...Array.from({ length: 4 }, () => t({ grade_letter: 'C', outcome: 'Win', r_multiple: 1 })),
  ];
  const g = gradePredictors(ts);
  assert.equal(g.sameBoxes, true);
  assert.deepEqual(g.loserTargets[0], { key: 'EQH/EQL', n: 6 });
  assert.equal(g.loserThemes[0].id, 'early');
  assert.equal(g.suggestion?.key, 'not:EQH/EQL');
  assert.ok((g.suggestion!.separation ?? 0) > (g.current.separation ?? 0));
});
