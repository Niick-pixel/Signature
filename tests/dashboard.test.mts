/* The Dashboard's numbers: worlds, totals, tiles, the discipline score, the week. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { inWorld, totals, tileValues, scoreAxes, overallScore, dashboardData } = await import('../lib/dashboard');

let n = 0;
const t = (x: Record<string, unknown> = {}) => {
  n += 1;
  return {
    id: `d${n}`, date: '2026-10-20T09:45', created_at: '2026-10-20T15:00:00.000Z', undated: false,
    account: 'Demo', status: 'Settled', outcome: 'Win', r_multiple: 2, setup_type: 'Inversion', direction: 'Long',
    pnl_dollars: null, risk_dollars: 100, graded_post_hoc: false, deleted_at: null, ...x,
  } as never;
};

test('worlds: real, backtest, both; missed and planned never', () => {
  const real = t(); const bt = t({ account: 'Backtest (FX Replay)' });
  const missed = t({ account: 'Missed' }); const planned = t({ status: 'Planned' });
  assert.equal(inWorld(real, 'real'), true);
  assert.equal(inWorld(real, 'backtest'), false);
  assert.equal(inWorld(bt, 'backtest'), true);
  assert.equal(inWorld(bt, 'all'), true);
  assert.equal(inWorld(missed, 'all'), false);
  assert.equal(inWorld(planned, 'all'), false);
});

test('totals: money from pnl or risk × R, R summed', () => {
  const s = totals([t(), t({ outcome: 'Loss', r_multiple: -1 }), t({ pnl_dollars: 50, r_multiple: 0.5 })]);
  assert.deepEqual(s, { trades: 3, wins: 2, losses: 1, money: 150, r: 1.5 });
  assert.equal(totals([t({ risk_dollars: null })]).money, null);
});

test('tiles: win rate, average win, profit factor', () => {
  const v = tileValues([t(), t({ r_multiple: 1 }), t({ outcome: 'Loss', r_multiple: -1 })]);
  assert.equal(v.winRate, 0.667);
  assert.equal(v.avgWinR, 1.5);
  assert.equal(v.profitFactor, 3);
  assert.equal(v.avgWin, 150);
  assert.equal(v.avgLoss, 100);
  assert.equal(tileValues([t()]).profitFactor, null);
});

test('score axes and the overall score skip what is off or unmeasurable', () => {
  const ts = [t({ date: '2026-10-19T09:45' }), t({ date: '2026-10-20T09:45', outcome: 'Loss', r_multiple: -1, graded_post_hoc: true })];
  const a = scoreAxes(ts, 0.5);
  assert.equal(a.rules, 50);
  assert.equal(a.honesty, 50);
  assert.equal(a.consistency, 50);
  assert.equal(a.profitFactor, 100);
  assert.equal(a.avgR, 75);
  assert.equal(a.winRate, 50);
  assert.equal(overallScore(a), Math.round((50 + 50 + 50 + 100 + 75 + 50) / 6));
  assert.equal(overallScore(a, { profitFactor: false, avgR: false }), 50);
  assert.equal(scoreAxes([], null).rules, null);
  assert.equal(overallScore(scoreAxes([], null)), null);
});

test('dashboard data: this week Monday to Sunday, the curve, recent first', () => {
  const ts = [
    t({ date: '2026-10-26T09:45' }), // Monday
    t({ date: '2026-10-28T09:45', outcome: 'Loss', r_multiple: -1 }),
    t({ date: '2026-09-01T09:45' }),
    t({ date: '2026-10-27T09:45', account: 'Backtest (FX Replay)' }),
  ];
  const d = dashboardData(ts, 'real', '2026-10-29', 1);
  assert.equal(d.total.trades, 3);
  assert.equal(d.week[0].day, '2026-10-26');
  assert.equal(d.week[0].r, 2);
  assert.equal(d.week[2].r, -1);
  assert.equal(d.week[1].trades, 0, 'backtests stay out of the real world');
  assert.equal(d.week7.trades, 2);
  assert.deepEqual(d.curve.map((p) => p.r), [2, 4, 3]);
  assert.equal(d.recent[0].day, '2026-10-28');
  assert.equal(dashboardData(ts, 'all', '2026-10-29', null).total.trades, 4);
});

test('tiles: the profit factor halves, average loss in R', () => {
  const v = tileValues([t(), t({ r_multiple: 1 }), t({ outcome: 'Loss', r_multiple: -1 }), t({ outcome: 'Loss', r_multiple: -0.5 })]);
  assert.equal(v.grossWinR, 3);
  assert.equal(v.grossLossR, 1.5);
  assert.equal(v.avgLossR, 0.75);
  assert.equal(v.grossWin, 300);
  assert.equal(v.grossLoss, 150);
  assert.equal(tileValues([t({ risk_dollars: null })]).grossWin, null);
});

test('daily: one point per day, the running total at its close, the day net on its own', () => {
  const ts = [
    t({ date: '2026-10-20T09:45' }),
    t({ date: '2026-10-20T11:00', outcome: 'Loss', r_multiple: -1 }),
    t({ date: '2026-10-22T09:45', r_multiple: 1 }),
    // An undated backtest counts on the day it was logged, even when its date sorts elsewhere.
    t({ date: '2026-10-25T09:45', undated: true, created_at: '2026-10-20T15:00:00.000Z', account: 'Backtest (FX Replay)', r_multiple: 3 }),
  ];
  const d = dashboardData(ts, 'all', '2026-10-29', null);
  assert.deepEqual(d.daily.map((p) => p.day), ['2026-10-20', '2026-10-22']);
  assert.deepEqual(d.daily.map((p) => p.netR), [4, 1]);
  assert.deepEqual(d.daily.map((p) => p.r), [4, 5]);
  assert.deepEqual(d.daily.map((p) => p.trades), [3, 1]);
  assert.equal(d.daily[d.daily.length - 1].r, d.total.r, 'ends where the total ends');
});
