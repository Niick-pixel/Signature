/**
 * Recency weighting: a trade counts 0.5^(age / H), its age measured in trades
 * (the newest is 0). H = 60 by default: a trade 60 trades ago counts half.
 * Every formula that uses n uses the effective n instead: (Σw)² / Σw².
 */
export const DEFAULT_HALF_LIFE = 60;
export type Window = 'all' | 'recent' | 'rubric';

/** Weights for trades in time order (oldest first). With no half-life, all 1. */
export function recencyWeights(n: number, halfLife: number | null = DEFAULT_HALF_LIFE): number[] {
  return Array.from({ length: n }, (_, i) => (halfLife == null ? 1 : 0.5 ** ((n - 1 - i) / halfLife)));
}

export function effectiveN(w: readonly number[]): number {
  const s = w.reduce((a, b) => a + b, 0); const s2 = w.reduce((a, b) => a + b * b, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
}

/** Weighted mean and (bias-corrected, by effective n) variance. */
export function weightedMoments(x: readonly number[], w: readonly number[]): { mean: number; variance: number; nEff: number; sumW: number } {
  const sumW = w.reduce((a, b) => a + b, 0);
  if (!sumW) return { mean: 0, variance: 0, nEff: 0, sumW: 0 };
  const mean = x.reduce((a, v, i) => a + v * w[i], 0) / sumW;
  const nEff = effectiveN(w);
  const raw = x.reduce((a, v, i) => a + w[i] * (v - mean) ** 2, 0) / sumW;
  return { mean, variance: nEff > 1 ? (raw * nEff) / (nEff - 1) : 0, nEff, sumW };
}
