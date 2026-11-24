/* Big update, batch E: prop rules as arithmetic (lib/propPlan) and the A+ gallery (lib/playbookGallery). */
import test from 'node:test';
import assert from 'node:assert/strict';
const P = await import('../lib/propPlan');
const G = await import('../lib/playbookGallery');

const acct = { start_balance: 50000, max_drawdown: 2000, trail_lock: 100, drawdown_type: 'eod_trailing' as const, daily_loss: 1000,
  consistency: 0.5, profit_target: 3000, phase: 'eval' as const, min_days: 3, max_contracts: 5 };
const day = (d: string, pnl: number) => ({ day: d, pnl, trades: 1, balance: 0, floor: 0 });

test('today: the first limit, the consistency room, the target and days left', () => {
  const s = { room: 2600, today: { pnl: 200, dailyLeft: 1200 }, days: [day('2026-11-20', 800), day('2026-11-23', 400), day('2026-11-24', 200)], profit: 1400, tradingDays: 3 };
  const t = P.todayRoom(acct, s, '2026-11-24');
  assert.equal(t.canLose, 1200); assert.equal(t.firstLimit, 'daily');
  // Others made 1200, best 800: today may reach max(800, 0.5·1200/0.5 = 1200) → 1000 more after today's 200.
  assert.equal(t.consistencyRoom, 1000);
  assert.deepEqual([t.toTarget, t.daysLeft], [1600, 0]);
  assert.equal(P.todayRoom({ ...acct, consistency: null }, s, '2026-11-24').consistencyRoom, null);
  assert.equal(P.todayRoom(acct, { ...s, room: 300 }, '2026-11-24').firstLimit, 'drawdown');
});

test('what if: the floor trails and locks, a breach is dated, the pass conditions are read', () => {
  const s = { balance: 50000, peak: 50000, floor: 48000, profit: 0, days: [], tradingDays: 0 };
  const pass = P.simulate(acct, s, [1200, 900, 1000]);
  assert.equal(pass.breach, null);
  assert.equal(pass.days[2].floor, 50100, 'the trail locks at start + 100');
  assert.deepEqual([pass.consistencyOk, pass.daysOk, pass.targetMet, pass.passes], [true, true, true, true]);
  const fail = P.simulate(acct, s, [2500, 100, -1100]);
  assert.deepEqual(fail.breach, { n: 3, rule: 'daily' });
  assert.equal(fail.consistencyOk, false, '2500 of 1500 total');
  const floor = P.simulate(acct, s, [-800, -800, -500]);
  assert.deepEqual(floor.breach, { n: 3, rule: 'drawdown' });
  assert.deepEqual(P.parsePlan('+400, -250 $300; x 0'), [400, -250, 300]);
});

test('size: rounded down, capped by the account, never a contract that risks more than asked', () => {
  const z = P.sizeFor(12, 500, null);
  assert.deepEqual(z.map((x) => [x.instrument, x.contracts, x.risk]), [['NQ', 2, 480], ['MNQ', 20, 480]]);
  assert.deepEqual(P.sizeFor(12, 500, 1).map((x) => x.contracts), [1, 10], 'max 1 mini = 10 micros');
  assert.equal(P.sizeFor(30, 500)[0].contracts, 0, '$600 a contract: none');
  assert.deepEqual(P.sizeFor(0, 500), []);
});

test('the A+ gallery: graded A+/A, every rule kept, with a chart — never chosen by the result', () => {
  let n = 0;
  const t = (x: Record<string, unknown>) => ({ id: `g${++n}`, date: '2026-11-0' + n + 'T09:45', account: 'Demo', outcome: 'Win', status: 'Settled', r_multiple: 2,
    grade_letter: 'A+', regrade: null, rubric_version: 2, setup_type: 'iFVG', direction: 'Long', screenshot_path: `s${n}.png`, deleted_at: null, ...x }) as never;
  const trades = [t({}), t({ outcome: 'Loss', r_multiple: -1 }), t({ grade_letter: 'B' }), t({ screenshot_path: '' }), t({ id: 'broke' }), t({ grade_letter: 'A', setup_type: 'Breaker' })];
  const clean = (x: { id: string }) => x.id !== 'broke';
  const groups = G.galleryGroups(trades, clean);
  assert.deepEqual(groups.map((g) => [g.setup, g.items.length, g.aplus]), [['iFVG', 2, 2], ['Breaker', 1, 0]], 'a clean A+ that lost stays; B, no chart and a broken rule do not');
  const near = G.compareAPlus(t({ id: 'draft', direction: 'Long' }), trades, clean, 3);
  assert.ok(near.every((x) => !('r' in x)), 'the peek carries no result');
});
