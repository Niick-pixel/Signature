/* The weekly report (lib/weeklyReport) and the plan analytics (lib/replayStats planAnalytics): big update, #5 and #6. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { weeklyReport } = await import('../lib/weeklyReport');
const { planAnalytics } = await import('../lib/replayStats');
const R = await import('../lib/replay');
const { BACKTEST } = await import('../lib/domain');

let n = 0;
const t = (d: string, x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `w${n}`, date: `${d}T09:45`, created_at: `${d}T15:00:00.000Z`, account: 'Demo', status: 'Settled', outcome: 'Win',
    r_multiple: 2, direction: 'Long', premium_discount: 'Discount', sweep_tier: 'major', trigger_fired: true, target_type: 'PDH/PDL',
    r_to_nearest_bucket: '2+', chk_killzone: true, chk_no_news: true, management: 'BE at 1R', mfe_r: 2, undated: false,
    setup_type: 'iFVG', grade_letter: 'A', checklist_score: 85, mistake_tags: [], worked_tags: [], explanation: '', lesson: '', screenshot_path: null,
    pnl_dollars: null, fees_dollars: null, regrade: null, drill_key: null, drill_kept: null, grade_override: null, deleted_at: null, ...x,
  } as never;
};

test('the week on one page: money, rules with their trades, re-grades, setups, the drill, three to re-watch', () => {
  const trades = [
    t('2026-10-12', { outcome: 'Loss', r_multiple: -1 }),                                                       // last week: out
    t('2026-10-19', { r_multiple: 1.5, pnl_dollars: 148, fees_dollars: 2, regrade: 'A', drill_key: 'early', drill_kept: 'kept' }),
    t('2026-10-20', { outcome: 'Loss', r_multiple: -1, trigger_fired: false, pnl_dollars: -102, fees_dollars: 2, regrade: 'B', drill_key: 'early', drill_kept: 'broken' }),
    t('2026-10-21', { outcome: 'Loss', r_multiple: -1, mfe_r: 1.6, setup_type: 'Breaker', pnl_dollars: -100 }),
    t('2026-10-22', { account: 'Backtest (FX Replay)', outcome: 'Loss', r_multiple: -1, mfe_r: 0 }),
  ];
  const w = weeklyReport(trades, '2026-10-19', { drillTitle: (k) => (k === 'early' ? 'Entering early' : k) });
  assert.deepEqual([w.money.net, w.money.fees, w.money.trades], [-54, 4, 3]);
  assert.deepEqual(w.broken.map((b) => [b.short, b.trades.map((x) => x.r)]), [['Inversion close', [-1]]]);
  assert.deepEqual([w.regrades.same, w.regrades.harsher], [1, 1]);
  assert.equal(w.setups.world, 'Real');
  assert.deepEqual(w.setups.rows.map((s) => s.setup), ['iFVG', 'Breaker']);
  assert.deepEqual(w.drill, { key: 'early', title: 'Entering early', kept: 1, broken: 1, na: 0, unanswered: 0 });
  assert.deepEqual(w.rewatch.map((x) => x.why), ['Broke inversion close and lost', 'Was +1.6R before it turned', 'Every rule kept — the one to repeat']);
  assert.equal(new Set(w.rewatch.map((x) => x.id)).size, 3, 'three different trades');
  assert.deepEqual([w.plan.in, w.plan.off, w.plan.none], [0, 0, 3], 'no prep written: no plan to compare with');
});

test('an empty week reads as empty, never as a verdict', () => {
  const w = weeklyReport([], '2026-10-19');
  assert.deepEqual([w.money.net, w.broken.length, w.rewatch.length, w.drill], [null, 0, 0, null]);
});

test('plan analytics: matched days, kill switches respected or traded through, first targets, bias and overnight', () => {
  const sc = (x: Partial<ReturnType<typeof R.emptyScenario>> = {}) => ({ ...R.emptyScenario(), ...x });
  const ctx = (x: Record<string, unknown> = {}) => ({ ...R.emptyContext(), h4: 'Bull', h1Agrees: true, overnight: 'Lows run', taken: ['Asia low'], ...x });
  const day = (id: string, outcome: string, x: Record<string, unknown> = {}) => ({
    id, closed_at: 'x', amended_at: null, outcome, context: ctx(), scenarios: { a: sc({ kills: ['Never reaches the zone'], targets: ['PDH'] }), b: sc({ kills: ['Opposing HTF gap forms'] }) }, ...x,
  }) as never;
  const bt = (id: string, dayId: string, sc2: string, r: number, x: Record<string, unknown> = {}) =>
    ({ id, account: BACKTEST, decision: 'take', r_multiple: r, outcome: r > 0 ? 'Win' : 'Loss', replay_day_id: dayId, plan_scenario: sc2, target_hit: null, partial_win: null, deleted_at: null, ...x }) as never;
  const days = [day('d1', 'A'), day('d2', 'C'), day('d3', 'B', { context: ctx({ h1Agrees: false, overnight: 'Highs run' }) })];
  const trades = [bt('t1', 'd1', 'A', 2), bt('t2', 'd1', 'A', -1, { target_hit: false }), bt('t3', 'd2', 'A', -1), bt('t4', 'd3', 'B', 1.5)];
  const p = planAnalytics(days, trades);
  assert.deepEqual([p.matched.played.days, p.matched.played.trades, p.matched.played.wins], [2, 3, 2]);
  assert.deepEqual([p.matched.notPlayed.days, p.matched.notPlayed.trades, p.matched.notPlayed.avgR], [1, 1, -1]);
  const never = p.kills.find((k) => k.label === 'Never reaches the zone')!;
  assert.deepEqual([never.killed, never.stayedOut, never.tradedThrough, never.throughR], [2, 1, 1, -1], 'A did not play on d2 (traded anyway) and d3 (stayed out)');
  assert.deepEqual(p.targets, [{ label: 'PDH', trades: 2, reached: 1 }], 'a full win reached it; a recorded miss did not');
  assert.deepEqual(p.byBias.map((g) => [g.label, g.days]), [['Bias long', 2], ['No bias', 1]]);
  assert.deepEqual(p.byOvernight.map((g) => [g.label, g.days]), [['Highs run', 1], ['Lows run', 2]]);
});
