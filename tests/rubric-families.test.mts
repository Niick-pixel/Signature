/*
  Stats Pass 1 — rubric families. Legacy-rubric data (rubric 4 or below) is
  frozen; rubric-dependent stats read one family at a time and never pool
  legacy and v2 trades; decision fields left unset stay null, never imputed.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-families-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const D = await import('../lib/decision');
const { scoreModel } = await import('../lib/edge/scoreModel');
const { setupQuality } = await import('../lib/edge/quality');
const { labFiltersFor, LAB_FILTERS } = await import('../lib/edge/ruleLab');
const { similarInFamily, V2_MIN_MATCHES } = await import('../lib/edge/similar');
const { hitRates, adjustedThresholds, newClaims } = await import('../lib/edge/claims');
const { whenTrades } = await import('../lib/stats');
const { busiestSource } = await import('../lib/statsScope');
const { integrity, unsetAtDecision } = await import('../lib/edge/integrity');
const { field, PREDICTORS } = await import('../lib/edge/fields');
const { edgeMetrics } = await import('../lib/edge/metrics');
const { familyOf, legacyLabel } = await import('../lib/dashboard/registry');
const { registry } = await import('../lib/dashboard/catalog');
const { missedStats } = await import('../lib/edge/missed');

type T = Record<string, unknown>;
let n = 0;
const day = (i: number) => `2026-${String(1 + Math.floor(i / 28) % 12).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}T09:40`;
const base = (x: T = {}): T => {
  n += 1;
  return {
    id: `t${n}`, date: day(n), created_at: `${day(n)}:00.000Z`, account: 'Demo', direction: 'Long', session: 'NY AM', setup_type: 'iFVG',
    r_multiple: n % 3 === 0 ? -1 : 1.5, outcome: n % 3 === 0 ? 'Loss' : 'Win', graded_post_hoc: false, deleted_at: null, undated: false,
    replay_day_id: null, rubric_version: 3, grade_letter: 'A', checklist_score: 92, ...x,
  };
};
const legacy = (x: T = {}) => base({ chk_killzone: n % 2 === 0, chk_htf_bias: true, ...x });
const v2 = (x: T = {}) => base({
  rubric_version: 5, decision: 'take', decided_at: '2026-11-01T09:40:00.000Z', outcome_at: '2026-11-01T10:40:00.000Z',
  row_sweep: 2, row_inversion: 2, row_path: 1, row_target: 2, singular_gap: true, plan_scenario: 'A', leg_location: 'Discount',
  htf_origin: '15m', planned_rr: '2', target_type: 'PDH/PDL', entry_method: 'On inversion close', confidence_at_entry: 4, grade_letter: 'A', checklist_score: 88, ...x,
});

/* ───────────── §1 the family ───────────── */

test('rubricFamily: rubric 5 is v2; 1–4, none and anything else are legacy', () => {
  assert.equal(D.rubricFamily({ rubric_version: 5 }), 'v2');
  for (const v of [1, 2, 3, 4, 0, null, undefined, 6]) assert.equal(D.rubricFamily({ rubric_version: v as number }), 'legacy', String(v));
  assert.equal(D.isRubricV2({ rubric_version: 5 }), true);
  assert.equal(D.onOldScale({ rubric_version: 4 }), true);
});

test('the New trade form never creates a legacy-rubric trade: new → the decision flow; only an old trade, edited, keeps the old form', () => {
  assert.equal(D.formFor(undefined), 'decision');
  assert.equal(D.formFor(null), 'decision');
  assert.equal(D.formFor({ rubric_version: 5 }), 'decision');
  assert.equal(D.formFor({ rubric_version: 3 }), 'legacy-edit');
});

test('a trade saved from the decision flow is graded under Rubric v2', async () => {
  const { createTrade } = await import('../db/trades');
  const { parseTradeInput } = await import('../lib/validate');
  const r = parseTradeInput({
    date: '2026-11-13T09:45', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Backtest replay', setup_type: 'iFVG',
    htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL', outcome: 'Win', r_multiple: null, account: 'Backtest (FX Replay)',
    status: 'Live', explanation: '', lesson: '', row_sweep: 2, row_inversion: 2, row_path: 2, row_target: 1, singular_gap: true, htf_origin: '15m',
    plan_scenario: 'A', leg_location: 'Discount', planned_rr: '2', entry_method: 'On inversion close', confidence_at_entry: 4,
    decision: 'take', decided_at: '2026-11-13T09:45:21.000Z', decision_seconds: 21, decision_limit: 40, grade_override: false,
  });
  assert.ok(r.ok, r.ok ? '' : r.error);
  const t = createTrade((r as { value: never }).value);
  assert.equal(D.rubricFamily(t), 'v2');
});

/* ───────────── §2 widgets: agnostic or dependent ───────────── */

test('widget families: dependent widgets read v2 by default or Legacy when saved; v2 widgets v2; the rest every trade', () => {
  const get = (id: string) => registry.get(id)!;
  for (const id of ['grade-calibration', 'grade-shift', 'spread', 'weights', 'anatomy', 'rule-lab', 'backtest-gap', 'focus', 'missed', 'hesitation', 'point-fix', 'point-keep']) {
    assert.equal(get(id).settings.family, 'toggle', id);
    assert.equal(familyOf(get(id), {}), 'v2', `${id} defaults to v2`);
    assert.equal(familyOf(get(id), { family: 'legacy' }), 'legacy');
  }
  for (const id of ['v2-total', 'v2-rows', 'v2-gap', 'v2-origin', 'v2-mirrors', 'v2-pass-reasons', 'v2-fear-rule', 'v2-scenario', 'v2-time', 'v2-decisions']) {
    assert.equal(familyOf(get(id), { family: 'legacy' }), 'v2', id);
  }
  for (const id of ['expectancy', 'equity', 'when', 'rules-followed', 'tilt', 'verdict', 'point-rules', 'point-risk', 'integrity', 'health', 'flaw-1', 'similar', 'replay-zones']) {
    assert.equal(familyOf(get(id), { family: 'legacy' }), 'all', id);
  }
  assert.equal(legacyLabel({ n: 51, first: '2026-08-04', last: '2026-10-30' }), 'Legacy rubric · frozen · 51 trades · 2026-08-04–2026-10-30');
  assert.equal(legacyLabel({ n: 1, first: '2026-08-04', last: '2026-08-04' }), 'Legacy rubric · frozen · 1 trade · 2026-08-04');
});

/* ───────────── §3 the score model ───────────── */

test('the learned score is fitted on legacy trades only: v2 trades never reach it, and are never imputed', () => {
  const old = Array.from({ length: 20 }, () => legacy()) as never[];
  const fresh = Array.from({ length: 30 }, () => v2({ r_multiple: 9 })) as never[];
  const a = scoreModel(old)!; const b = scoreModel([...old, ...fresh])!;
  assert.equal(b.n, 20);
  assert.deepEqual(b.fit.beta, a.fit.beta, 'the v2 trades changed nothing');
  assert.equal(scoreModel(fresh), null, 'no legacy trades, no model');
});

/* ───────────── §4 fields ───────────── */

test('the v2 decision fields are registered as pre; left unset they read null and are counted, never filled in', () => {
  for (const k of ['row_sweep', 'row_inversion', 'row_path', 'row_target', 'plan_scenario', 'v2_cap', 'leg_location', 'htf_origin']) {
    const f = field(k)!; assert.equal(f.timing, 'pre', k); assert.ok(PREDICTORS.includes(f), `${k} is a predictor`);
  }
  assert.equal(field('leg_location')!.objective, true);
  assert.equal(field('row_sweep')!.objective, false);
  const unset = v2({ leg_location: null, htf_origin: null, confidence_at_entry: null });
  assert.equal(field('leg_location')!.get(unset as never), null);
  assert.equal(field('v2_cap')!.get(unset as never), null, 'the cap needs the leg: unknown, not "no cap"');
  assert.equal(field('v2_cap')!.get(v2({ plan_scenario: 'B' }) as never), 'Scenario B');
  // A miss saved before a target was picked reads "Other" in the column: a default, so null here.
  assert.equal(field('target_type')!.get(v2({ decision: 'missed', target_type: 'Other' }) as never), null);
  assert.equal(field('target_type')!.get(v2({ decision: 'missed', target_type: 'PDH/PDL' }) as never), 'PDH/PDL', 'a picked target is kept');
  assert.equal(field('row_sweep')!.get(legacy() as never), null, 'never on a legacy trade');
  const u = unsetAtDecision([unset, v2(), legacy()] as never[]);
  assert.equal(u.trades, 1);
  assert.deepEqual(u.fields.map((f) => f.key).sort(), ['confidence_at_entry', 'htf_origin', 'leg_location']);
  const settled = [unset, v2()] as never[];
  const issues = integrity(settled, edgeMetrics(settled.map((t: T) => ({ r: t.r_multiple as number }))));
  assert.ok(issues.some((i) => i.id === 'unset-decision' && /Unset at decision on 1 Rubric v2 trade/.test(i.text)));
});

/* ───────────── §5 grading ───────────── */

test('setup quality per family: legacy grades never meet v2 grades', () => {
  const ts = [...Array.from({ length: 10 }, () => legacy({ grade_letter: 'A' })), ...Array.from({ length: 10 }, () => v2({ grade_letter: 'B' }))] as never[];
  const old = setupQuality(ts, 'legacy'); const now = setupQuality(ts, 'v2');
  assert.deepEqual(old.clean.rows.map((r) => r.grade), ['A']); assert.equal(old.cleanN, 10);
  assert.deepEqual(now.clean.rows.map((r) => r.grade), ['B']); assert.equal(now.cleanN, 10);
  assert.equal(old.spread.family, 'legacy'); assert.equal(now.spread.family, 'v2');
});

test('does your filter filter, on v2: 0/1/2 per row, a row 2/2 on more than 90% of 10+ trades flagged, the gates counted', () => {
  const ts = [
    ...Array.from({ length: 11 }, (_, i) => v2({ row_sweep: 2, row_path: i % 3 })),
    v2({ singular_gap: false, grade_letter: 'F' }), v2({ planned_rr: '1' }),
  ] as never[];
  const s = setupQuality(ts, 'v2').spread;
  const sweep = s.items.find((i) => i.key === 'row_sweep')!; const pathRow = s.items.find((i) => i.key === 'row_path')!;
  assert.deepEqual(sweep.dist, [0, 0, 13]); assert.equal(sweep.notFiltering, true);
  assert.equal(pathRow.notFiltering, false);
  assert.equal(pathRow.dist!.reduce((a, b) => a + b, 0), 13);
  assert.equal(s.gates!.manyGaps, 1); assert.equal(s.gates!.lowR, 1);
  // Under 10 trades a row is never flagged.
  assert.equal(setupQuality(ts.slice(0, 9), 'v2').spread.items.find((i) => i.key === 'row_sweep')!.notFiltering, false);
});

test('the Rule Lab offers one family\'s grade and checklist filters at a time, never both', () => {
  const ids = (f: ReturnType<typeof labFiltersFor>) => f.map((x) => x.id);
  assert.ok(ids(labFiltersFor('v2')).includes('v2-a-grade')); assert.ok(!ids(labFiltersFor('v2')).includes('a-grade'));
  assert.ok(ids(labFiltersFor('legacy')).includes('a-grade')); assert.ok(!ids(labFiltersFor('legacy')).includes('v2-a-grade'));
  assert.ok(!ids(labFiltersFor(null)).some((id) => LAB_FILTERS.find((f) => f.id === id)!.family), 'none on an all-trades view');
  const v2A = LAB_FILTERS.find((f) => f.id === 'v2-a-grade')!; const oldA = LAB_FILTERS.find((f) => f.id === 'a-grade')!;
  const ctx = { breaks: [], sinceFirstLoss: null };
  assert.equal(v2A.test(legacy() as never, undefined, ctx), null, 'a v2 filter cannot judge a legacy trade');
  assert.equal(oldA.test(v2() as never, undefined, ctx), null, 'nor a legacy filter a v2 one');
});

test('missed setups compare skip and take scores on one rubric\'s scale', () => {
  const skips = Array.from({ length: 8 }, () => v2({ account: 'Missed', written_before_outcome: true, checklist_score: 75 }));
  const takes = Array.from({ length: 8 }, () => legacy({ checklist_score: 92 }));
  assert.equal(missedStats([...skips, ...takes] as never[], 'v2').takeScore, null, 'the legacy takes are not on the v2 scale');
  assert.equal(missedStats([...skips, ...takes] as never[], 'legacy').skipScore, null);
});

/* ───────────── §6 the ledger ───────────── */

test('retired claims are out of the hit rate and the thresholds; new claims carry their family', () => {
  const c = (status: string, verdict = 'likely') => ({ id: `c${n++}`, created_at: '', scope: 's', kind: 'anatomy', field: 'direction', level: 'Long', direction: 'positive' as const, size: 0.5, verdict, n_at: 30, last_trade_at: '', status, eval_n: null, eval_size: null, eval_p: null, family: 'legacy' as const });
  const retired = Array.from({ length: 8 }, () => c('retired'));
  const rate = hitRates(retired as never).find((r) => r.level === 'likely')!;
  assert.equal(rate.checked, 0);
  assert.deepEqual(adjustedThresholds(retired as never).changes, [], 'a retired claim never raises a threshold');
  const failed = Array.from({ length: 6 }, () => c('faded'));
  assert.equal(adjustedThresholds([...failed, ...retired] as never).changes.length, 1, 'checked claims still do');
  const row = { field: 'direction', level: 'Long', hidden: false, diff: 0.4, verdict: { level: 'hint', direction: 'positive' } };
  assert.equal(newClaims([row] as never, 's2', 40, 'x', [], 'v2')[0].family, 'v2');
});

test('migration 052: every claim records a family; an export from before it restores its open legacy claims as retired', async () => {
  const { getDb } = await import('../db/index');
  const E = await import('../db/edge');
  const cols = (getDb().prepare('PRAGMA table_info(insights)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(cols.includes('family'));
  const id = E.addInsight({ scope: 's', kind: 'anatomy', field: 'direction', level: 'Long', direction: 'positive', size: 0.4, verdict: 'hint', n_at: 40, last_trade_at: 'x' });
  assert.equal(E.listInsights().find((r) => r.id === id)!.family, 'v2', 'new claims are v2');
  assert.equal(Object.getPrototypeOf(E.listInsights()[0]), Object.prototype, 'plain objects: Engine health hands them to a client component');
  const old = { id: 'old-1', created_at: '2026-10-01T00:00:00.000Z', scope: 's', kind: 'anatomy', field: 'direction', level: 'Long', direction: 'positive', size: 0.3, verdict: 'hint', n_at: 30, last_trade_at: 'x', status: 'open' };
  E.restoreEdge({ insights: [old, { ...old, id: 'old-2', status: 'held' }] });
  const got = E.listInsights();
  assert.deepEqual([got.find((r) => r.id === 'old-1')!.status, got.find((r) => r.id === 'old-1')!.family], ['retired', 'legacy']);
  assert.equal(got.find((r) => r.id === 'old-2')!.status, 'held', 'a checked claim keeps its result');
  assert.throws(() => getDb().prepare("UPDATE insights SET family = 'v3' WHERE id = ?").run(id));
  // Rollback: retired back to open, the family dropped; then forward again.
  const { rollback } = await import('../db/cli-rollback');
  rollback('052', getDb());
  const back = getDb().prepare("SELECT status FROM insights WHERE id = 'old-1'").get() as { status: string };
  assert.equal(back.status, 'open');
  assert.ok(!(getDb().prepare('PRAGMA table_info(insights)').all() as Array<{ name: string }>).some((c) => c.name === 'family'));
});

/* ───────────── §7 small fixes ───────────── */

test('Day and hour: a backtest with no replay date is left out and counted; never its log time as market time', () => {
  const real = base({ account: 'Live' });
  const onDay = base({ account: 'Backtest (FX Replay)', replay_day_id: 'd1' });
  const moved = base({ account: 'Backtest (FX Replay)' });
  const loose = base({ account: 'Backtest (FX Replay)' });
  const undated = base({ account: 'Backtest (FX Replay)', undated: true, replay_day_id: 'd1' });
  const w = whenTrades([real, onDay, moved, loose, undated] as never[], new Set([moved.id as string]));
  assert.deepEqual(w.trades.map((t: T) => t.id), [real.id, onDay.id, moved.id]);
  assert.equal(w.noReplayDate, 2);
});

test('the Stats board first opens on the source with the most trades logged in the last 14 days', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const at = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const bt = (d: number) => ({ account: 'Backtest (FX Replay)' as const, created_at: at(d) });
  const live = (d: number) => ({ account: 'Live' as const, created_at: at(d) });
  assert.equal(busiestSource([bt(1), bt(2), bt(3), live(1), live(20), live(21), live(22)], now), 'backtest', 'old real trades do not count');
  assert.equal(busiestSource([bt(1), live(2)], now), 'real', 'a tie goes to real');
  assert.equal(busiestSource([], now), 'real');
  assert.equal(busiestSource([{ account: 'Missed' as const, created_at: at(1) }, { account: 'Missed' as const, created_at: at(1) }, bt(1)], now), 'backtest', 'missed setups never count');
});

test('similar setups: a v2 trade is matched with v2 trades only, and shows nothing under 10', () => {
  const draft = v2();
  const pool = [...Array.from({ length: 4 }, () => v2()), ...Array.from({ length: 40 }, () => legacy())] as never[];
  const s = similarInFamily(draft as never, pool);
  assert.equal(s.pool, 4);
  assert.deepEqual(s.v2, { have: s.n, need: V2_MIN_MATCHES });
  assert.equal(s.meanR, null); assert.deepEqual(s.neighbours, []);
  const old = similarInFamily(legacy() as never, pool);
  assert.equal(old.pool, 40, 'a legacy trade against legacy trades only');
  assert.equal(old.v2, undefined);
});

/* ───────────── the engine: one family per view ───────────── */

test('the stats engine reads one family when asked, every trade otherwise; the legacy view carries its label numbers', async () => {
  const { createTrade } = await import('../db/trades');
  const { parseTradeInput } = await import('../lib/validate');
  const { statsEngine } = await import('../db/statsEngine');
  const make = (x: T) => {
    const r = parseTradeInput({
      date: '2026-09-20T09:41', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
      htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'EQH/EQL', outcome: 'Win', r_multiple: 2, account: 'Live',
      explanation: 'E'.repeat(170), lesson: 'L'.repeat(170), screenshot_path: 'x.png', ...x,
    });
    if (!r.ok) throw new Error(r.error);
    return createTrade(r.value);
  };
  const olds = [make({ date: '2026-08-04T09:41' }), make({ date: '2026-09-01T09:41', outcome: 'Loss', r_multiple: -1 })];
  // Graded under Rubric v2, as the decision flow saves it, with its outcome written.
  const fresh = make({ date: '2026-11-03T09:41', status: 'Settled', row_sweep: 2, row_inversion: 2, row_path: 2, row_target: 1, singular_gap: true, htf_origin: '15m',
    plan_scenario: 'A', leg_location: 'Discount', planned_rr: '2', entry_method: 'On inversion close', confidence_at_entry: 4,
    decision: 'take', decided_at: '2026-11-03T09:41:20.000Z', decision_seconds: 20, decision_limit: 40, grade_override: false, outcome_at: '2026-11-03T10:00:00.000Z' });
  const ids = (v: { settled: Array<{ id: string }> }) => v.settled.map((t) => t.id).filter((id) => [...olds, fresh].some((x) => x.id === id)).sort();
  const all = statsEngine({ account: 'Live' }, undefined);
  const onlyV2 = statsEngine({ account: 'Live', family: 'v2' }, undefined);
  const onlyOld = statsEngine({ account: 'Live', family: 'legacy' }, undefined);
  assert.deepEqual(ids(all), [...olds, fresh].map((t) => t.id).sort());
  assert.deepEqual(ids(onlyV2), [fresh.id]);
  assert.deepEqual(ids(onlyOld), olds.map((t) => t.id).sort());
  assert.ok(onlyOld.settled.every((t) => D.rubricFamily(t) === 'legacy'));
  assert.equal(onlyOld.familySpan!.first, '2026-08-04');
  assert.equal(all.familySpan, null);
  assert.equal(onlyV2.quality.family, 'v2');
  assert.equal(onlyOld.model, null, 'two legacy trades: too few to fit');
});
