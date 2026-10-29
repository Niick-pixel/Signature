/**
 * How many trades a question needs.
 *
 *  - Two groups, a difference δ in mean R: n per group ≈ 2·(z₁₋α/₂ + z₁₋β)²·σ² / δ²
 *    (α = 0.05, power 0.8: "≈ N trades in each to tell if A+ beats B by 0.5R").
 *  - The edge: trades until P(edge > 0) reaches 95% if expectancy E and spread
 *    σ hold: (1.645·σ / E)² (lib/edge/metrics tradesFor95).
 */
import { normInv } from './dist';

export function nPerGroup(sigma: number, delta: number, alpha = 0.05, power = 0.8): number {
  if (delta <= 0 || sigma <= 0) return Infinity;
  return Math.ceil((2 * (normInv(1 - alpha / 2) + normInv(power)) ** 2 * sigma ** 2) / delta ** 2);
}
