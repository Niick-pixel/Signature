/**
 * Percentile bootstrap for a mean: resample the trades with replacement, many
 * times, and read the spread of the resampled means. Seeded from the data
 * (lib/edge/rng), so the interval never jitters between reloads.
 */
import { mulberry32, seedOf } from './rng';

export interface MeanInterval {
  mean: number;
  lo80: number; hi80: number;
  lo95: number; hi95: number;
  /** Share of resamples whose mean is above zero: the chance the edge is real, read off the data. */
  pPositive: number;
  resamples: number;
}

const quantile = (sorted: Float64Array, q: number) => {
  const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function bootstrapMean(xs: readonly number[], opts: { resamples?: number; seed?: number } = {}): MeanInterval | null {
  const n = xs.length;
  if (n < 2) return null;
  const B = opts.resamples ?? 5000;
  const rand = mulberry32(opts.seed ?? seedOf(xs, 'mean'));
  const means = new Float64Array(B);
  let positive = 0;
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[Math.floor(rand() * n)];
    means[b] = s / n;
    if (means[b] > 0) positive += 1;
  }
  means.sort();
  return {
    mean: xs.reduce((a, v) => a + v, 0) / n,
    lo80: quantile(means, 0.1), hi80: quantile(means, 0.9),
    lo95: quantile(means, 0.025), hi95: quantile(means, 0.975),
    pPositive: positive / B, resamples: B,
  };
}
