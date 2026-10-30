/* Edge Engine, milestone 10: the insight ledger, thresholds that learn, Brier, Blind Re-grade, tier 3. */
import test from 'node:test';
import assert from 'node:assert/strict';
const C = await import('../lib/edge/claims');
const B = await import('../lib/edge/blind');
const { interaction, regimeField } = await import('../lib/edge/fields');
const { runEngine } = await import('../lib/edge/engine');
const { genFakeTrades } = await import('../lib/edge/synthetic');
const { DEFAULT_THRESHOLDS } = await import('../lib/edge/verdict');

let n = 0;
const t = (x: Record<string, unknown> = {}) => { n += 1; return { id: `c${n}`, date: '2026-06-01T09:40', created_at: `2026-06-01T10:00:${String(n % 60).padStart(2, '0')}.000Z`, account: 'Demo', r_multiple: 1, deleted_at: null, ...x } as never; };
const row = (x: Record<string, unknown>) => ({ field: 'direction', label: 'Direction', level: 'Long', hidden: false, diff: 0.4, diffSd: 0.1, nEff: 40, pBetter: 0.99, verdict: { level: 'likely', direction: 'positive', p: 0.99 }, ...x }) as never;
const stored = (x: Record<string, unknown>) => ({ id: `s${++n}`, created_at: '2026-01-01T00:00:00Z', scope: 's', kind: 'anatomy', field: 'direction', level: 'Long', direction: 'positive', size: 0.4, verdict: 'likely', n_at: 40, last_trade_at: '', status: 'open', eval_n: null, eval_size: null, eval_p: null, ...x }) as never;

test('claims: only rows above Too early, once per scope', () => {
  const rows = [row({}), row({ level: 'Short', verdict: { level: 'too-early', direction: null, p: 0.6 } }), row({ field: 'cisd', level: 'Yes', hidden: true })];
  const c = C.newClaims(rows, 's', 40, '2026-06-01', []);
  assert.equal(c.length, 1);
  assert.equal(C.newClaims(rows, 's', 41, '2026-06-02', [stored({})]).length, 0);
  assert.equal(C.newClaims(rows, 'other', 41, '2026-06-02', [stored({})]).length, 1);
});

test('re-check: needs 30 later trades; held, reversed or faded on those only', () => {
  const claim = { scope: 's', kind: 'anatomy', field: 'direction', level: 'Long', direction: 'positive' as const, size: 0.4, verdict: 'likely', n_at: 40, last_trade_at: '' };
  const later = (longR: number, shortR: number, k = 40) => Array.from({ length: k }, (_, i) => t({ direction: i % 2 ? 'Long' : 'Short', r_multiple: (i % 2 ? longR : shortR) + ((i % 5) - 2) * 0.1 }));
  assert.equal(C.recheck(claim, later(1, -1, 20)), null);
  assert.equal(C.recheck(claim, later(1, -1))!.status, 'held');
  assert.equal(C.recheck(claim, later(-1, 1))!.status, 'reversed');
  assert.equal(C.recheck(claim, later(0.02, 0))!.status, 'faded');
});

test('thresholds rise when Likely claims fail, and Confirmed needs a claim that held', () => {
  const fails = [...Array(4)].map(() => stored({ status: 'faded' })).concat([stored({ status: 'held' })]);
  const adj = C.adjustedThresholds(fails);
  assert.ok(adj.thresholds.likely > DEFAULT_THRESHOLDS.likely);
  assert.equal(adj.changes[0].level, 'likely');
  assert.equal(C.adjustedThresholds(fails.slice(0, 3)).changes.length, 0, 'fewer than 5 checked: no change');
  const good = [...Array(5)].map(() => stored({ status: 'held' }));
  assert.deepEqual(C.adjustedThresholds(good).thresholds, DEFAULT_THRESHOLDS);
  assert.deepEqual(C.hitRates(fails).find((r) => r.level === 'likely'), { level: 'likely', checked: 5, held: 1, rate: 0.2 });
  const r = row({ nEff: 40, pBetter: 0.995 });
  assert.equal(C.withConfirmed([r], 's', [], DEFAULT_THRESHOLDS)[0].verdict.level, 'likely');
  assert.equal(C.withConfirmed([r], 's', [stored({ status: 'held' })], DEFAULT_THRESHOLDS)[0].verdict.level, 'confirmed');
});

test('Brier: perfect, coin flip, base rate', () => {
  const tr = [t({ id: 'w', r_multiple: 2 }), t({ id: 'l', r_multiple: -1 }), t({ id: 'b', r_multiple: 0 })];
  assert.equal(C.brier([{ trade_id: 'w', p_win: 1 }, { trade_id: 'l', p_win: 0 }, { trade_id: 'b', p_win: 0.5 }], tr).score, 0);
  const coin = C.brier([{ trade_id: 'w', p_win: 0.5 }, { trade_id: 'l', p_win: 0.5 }], tr);
  assert.equal(coin.score, 0.25); assert.equal(coin.baseline, 0.25); assert.equal(coin.n, 2);
});

test('blind: ISO weeks, kappa, the weekly session with retests, the counter', () => {
  assert.equal(B.isoWeek('2026-10-29'), '2026-W44');
  assert.equal(B.isoWeek('2026-01-01'), '2026-W01');
  assert.equal(B.isoWeek('2027-01-01'), '2026-W53');
  assert.equal(B.weightedKappa([['A', 'A'], ['B', 'B'], ['C', 'C'], ['F', 'F']]).kappa, 1);
  assert.ok(B.weightedKappa([['A+', 'F'], ['F', 'A+'], ['A', 'C'], ['C', 'A']]).kappa! < 0);
  const pool = Array.from({ length: 30 }, () => t({ screenshot_path: 'x.png', entry_line_x: 0.6 }));
  const graded = [{ trade_id: (pool[0] as { id: string }).id, created_at: '2026-09-01T10:00:00Z', grade: 'A' }];
  const s1 = B.blindSession(pool, graded, '2026-10-29'); const s2 = B.blindSession(pool, graded, '2026-10-30');
  assert.equal(s1.length, 10);
  assert.deepEqual(s1.map((x: { id: string }) => x.id), s2.map((x: { id: string }) => x.id), 'same week, same session');
  assert.ok(s1.some((x: { id: string }) => x.id === graded[0].trade_id), 'a 14-day-old blind grade comes back for a retest');
  const pairs = B.retestPairs([{ trade_id: 'a', created_at: '2026-09-01T00:00:00Z', grade: 'A' }, { trade_id: 'a', created_at: '2026-09-20T00:00:00Z', grade: 'B' }, { trade_id: 'b', created_at: '2026-09-01T00:00:00Z', grade: 'A' }, { trade_id: 'b', created_at: '2026-09-05T00:00:00Z', grade: 'A' }]);
  assert.deepEqual(pairs, [['A', 'B']]);
  assert.deepEqual(B.blindCounter([{ trade_id: 'a', created_at: '2026-10-27T10:00:00Z', grade: 'A' }, { trade_id: 'b', created_at: '2026-10-01T10:00:00Z', grade: 'B' }], '2026-10-29'), { thisWeek: 1, total: 2, daysSince: 2 });
});

test('tier 3: interactions and the regime field are pre-trade, and appear only from 200 trades', () => {
  const f = interaction('liquidity_event', 'killzone')!;
  assert.equal(f.timing, 'pre'); assert.ok(f.predictor);
  assert.equal(f.get({ liquidity_event: 'PDH/PDL', session: 'NY AM', chk_killzone: true } as never), 'PDH/PDL × NY AM');
  assert.equal(f.get({ liquidity_event: null, session: 'NY AM' } as never), null);
  const rg = regimeField(Array.from({ length: 30 }, (_, i) => ({ stop_points: 10 + i }) as never))!;
  assert.equal(rg.get({ stop_points: 40 } as never), 'Wide stops'); assert.equal(rg.get({ stop_points: 12 } as never), 'Tight stops');
  assert.equal(regimeField([]), null);
  assert.equal(runEngine(genFakeTrades(150, { seed: 5 })).interactions, null);
  const big = runEngine(genFakeTrades(220, { seed: 5 }));
  assert.ok(big.interactions && big.interactions.rows.length > 0);
});
