/* Confidence ranges: Wilson for win rate, Student's t for expectancy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { winRateRange, meanRange, edgeRead, tCritical } from '../lib/confidence';

const near = (a: number, b: number, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('Wilson: known values, and it stays inside 0–100%', () => {
  const r = winRateRange(8, 14)!; // 57% on 14 trades
  near(r.lo, 0.326); near(r.hi, 0.786);
  const all = winRateRange(10, 10)!;
  assert.ok(all.hi <= 1 && all.lo > 0.6);
  const none = winRateRange(0, 10)!;
  assert.ok(none.lo >= 0 && none.hi < 0.35);
  assert.equal(winRateRange(0, 0), null);
});

test('more trades, narrower range', () => {
  const small = winRateRange(6, 10)!, big = winRateRange(240, 400)!;
  assert.ok(big.hi - big.lo < (small.hi - small.lo) / 4);
});

test('expectancy range with Student\'s t; reads the edge', () => {
  const rs = [2, -1, -1, 2, -1, 2, -1, 2, -1, 2]; // mean 0.5
  const r = meanRange(rs)!;
  near((r.lo + r.hi) / 2, 0.5, 1e-9);
  assert.ok(r.lo < 0 && r.hi > 1);
  assert.equal(edgeRead(r), 'unclear');
  assert.equal(edgeRead(meanRange(Array(30).fill(0).map((_, i) => (i % 3 === 0 ? -1 : 2)))), 'positive');
  assert.equal(edgeRead(meanRange([-1, -1, -1, -0.5, -1, -1, -1, -0.8])), 'negative');
  assert.equal(meanRange([1]), null);
  assert.equal(tCritical(9), 2.262);
  assert.ok(tCritical(500) < 1.97);
});
