/*
  The Stats page's scope: accounts (All is every account, Backtest and Missed
  included), period, session and direction — parsed from the URL and applied
  before any figure.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatsScope, applyStatsScope, periodStart, accountParam, mixesWorlds, measuredTrades } from '../lib/statsScope';
import type { Trade } from '../lib/types';

const available = ['Live', 'Backtest (FX Replay)', 'Demo', 'Missed'] as const;
const t = (o: Partial<Trade>) => ({ account: 'Live', date: '2026-10-05T09:45', undated: false, session: 'NY AM', direction: 'Long', ...o }) as Trade;

test('All accounts is every account, Backtest and Missed included', () => {
  const s = parseStatsScope({ account: 'All' }, [...available]);
  assert.deepEqual(s.accounts, [...available]);
  assert.equal(s.all, true);
  assert.equal(accountParam(s.accounts, available), 'All');
  assert.equal(mixesWorlds(s.accounts), true);
});

test('several accounts at once; unknown ones dropped; never nothing', () => {
  const s = parseStatsScope({ account: 'Demo,Live,Nope' }, [...available]);
  assert.deepEqual(s.accounts, ['Live', 'Demo']);
  assert.equal(s.all, false);
  assert.equal(accountParam(s.accounts, available), 'Live,Demo');
  assert.equal(mixesWorlds(s.accounts), false);
  // Nothing asked, nothing remembered: the busiest real account.
  assert.deepEqual(parseStatsScope({}, ['Backtest (FX Replay)', 'Demo']).accounts, ['Demo']);
  // The remembered choice is used when the URL says nothing.
  assert.deepEqual(parseStatsScope({}, [...available], 'Missed').accounts, ['Missed']);
});

test('period, session and direction narrow the trades; a period leaves undated backtests out', () => {
  const now = new Date('2026-10-07T12:00:00');
  assert.equal(periodStart('month', now), '2026-10-01');
  assert.equal(periodStart('30d', now), '2026-09-08');
  assert.equal(periodStart('year', now), '2026-01-01');
  assert.equal(periodStart('all', now), null);
  const trades = [
    t({ id: 'a' }),
    t({ id: 'b', date: '2026-08-01T09:45' }),
    t({ id: 'c', account: 'Backtest (FX Replay)', undated: true }),
    t({ id: 'd', session: 'London', direction: 'Short' }),
  ];
  const ids = (q: Record<string, string>) => applyStatsScope(trades, parseStatsScope({ account: 'All', ...q }, [...available]), now).map((x) => x.id);
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ period: 'month' }), ['a', 'd']);
  assert.deepEqual(ids({ session: 'London' }), ['d']);
  assert.deepEqual(ids({ dir: 'Long', session: 'NY AM,London' }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ period: 'nonsense' }), ['a', 'b', 'c', 'd']);
});

test('All keeps backtests (the page says it is mixed) but never counts missed setups as trades', () => {
  const s = parseStatsScope({ account: 'All' }, [...available]);
  const trades = [t({ account: 'Live' }), t({ account: 'Demo' }), t({ account: 'Backtest (FX Replay)' }), t({ account: 'Backtest (FX Replay)' }), t({ account: 'Missed' })];
  const m = measuredTrades(trades, s);
  assert.deepEqual(m.inView.map((x) => x.account), ['Live', 'Demo', 'Backtest (FX Replay)', 'Backtest (FX Replay)']);
  assert.deepEqual(m.leftOut, [{ account: 'Missed', n: 1 }]);
  // Missed on its own is measured as itself.
  const missed = measuredTrades(trades.filter((x) => x.account === 'Missed'), parseStatsScope({ account: 'Missed' }, [...available]));
  assert.equal(missed.inView.length, 1); assert.deepEqual(missed.leftOut, []);
  // Real accounts together: nothing left out.
  assert.equal(measuredTrades(trades, parseStatsScope({ account: 'Live,Demo' }, [...available])).leftOut.length, 0);
});
