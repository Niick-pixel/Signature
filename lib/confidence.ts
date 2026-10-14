/**
 * How sure is that number? A range around a statistic, not just the point.
 *
 * Win rate on 14 trades and win rate on 400 trades print the same way; they
 * are not the same claim. Every range here is a 95% interval: if the true
 * value were outside it, results like these would be unusual.
 *
 *   winRateRange    Wilson score interval — well behaved on small samples and
 *                   near 0% / 100%, where the textbook ±1.96·SE breaks down
 *                   (it can give −5% or 110%).
 *   meanRange       mean ± t·s/√n, Student's t, which widens properly on few
 *                   trades. Used for expectancy (average R per trade).
 */
export interface Range { lo: number; hi: number }

const Z95 = 1.959964;

export function winRateRange(wins: number, n: number): Range | null {
  if (n <= 0) return null;
  const p = wins / n;
  const z2 = Z95 * Z95;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Two-sided 95% Student's t critical values, by degrees of freedom. */
const T95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980,
};
export function tCritical(df: number): number {
  if (df <= 0) return Infinity;
  if (T95[df]) return T95[df];
  const keys = Object.keys(T95).map(Number).sort((a, b) => a - b);
  const above = keys.find((k) => k > df);
  return above == null ? Z95 : T95[above]; // the next tabled df up: slightly conservative
}

export function meanRange(values: readonly number[]): Range | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const half = tCritical(n - 1) * (sd / Math.sqrt(n));
  return { lo: mean - half, hi: mean + half };
}

/** What a range says about an edge, relative to `zero` (0R, or 50% only when asked). */
export function edgeRead(range: Range | null, zero = 0): 'positive' | 'negative' | 'unclear' | null {
  if (!range) return null;
  if (range.lo > zero) return 'positive';
  if (range.hi < zero) return 'negative';
  return 'unclear';
}
