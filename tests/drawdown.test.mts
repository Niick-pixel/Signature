/* The drawdown simulator: a bootstrap of the journal's own R results. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateDrawdowns, percentile, chanceOfReaching, MIN_SIM_SAMPLE } from '../lib/drawdown';

test('needs a minimum sample', () => {
  assert.equal(simulateDrawdowns([1, -1, 2]), null);
  assert.ok(MIN_SIM_SAMPLE >= 10);
});

test('seeded: the same results give the same answer', () => {
  const rs = [2, -1, -1, 2, -1, 3, -1, -1, 2, -1, 1.5, -1];
  const a = simulateDrawdowns(rs)!, b = simulateDrawdowns(rs)!;
  assert.deepEqual(a.maxDrawdowns.slice(0, 50), b.maxDrawdowns.slice(0, 50));
  assert.equal(a.runs, 2000);
  assert.equal(a.trades, 100);
});

test('the numbers behave: all winners never draw down; losers make streaks', () => {
  const winners = simulateDrawdowns(Array(12).fill(1))!;
  assert.equal(percentile(winners.maxDrawdowns, 0.95), 0);
  assert.equal(percentile(winners.streaks, 0.95), 0);
  assert.equal(percentile(winners.finals, 0.5), 100);
  const coin = simulateDrawdowns([1, -1, 1, -1, 1, -1, 1, -1, 1, -1])!;
  // 100 fair coin flips: a worst streak of 4 to 10 is the usual range.
  const typical = percentile(coin.streaks, 0.5);
  assert.ok(typical >= 4 && typical <= 10, String(typical));
  assert.ok(percentile(coin.maxDrawdowns, 0.95) >= percentile(coin.maxDrawdowns, 0.5));
  // The chance of reaching a drawdown falls as the limit rises.
  assert.ok(chanceOfReaching(coin, 3) > chanceOfReaching(coin, 15));
  assert.equal(chanceOfReaching(coin, 0), 0);
});
