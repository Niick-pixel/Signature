/**
 * Empirical-Bayes shrinkage: a small group's mean is pulled toward the global
 * mean, so a handful of trades cannot make an extreme claim.
 *
 *   μ̂_g = (n_g·x̄_g + k·μ) / (n_g + k)      posterior SD ≈ √(σ² / (n_g + k))
 *
 * μ is the global (recency-weighted) mean, σ² the pooled within-group
 * variance, and k = σ² / τ², where τ² — how much groups truly differ — is
 * max(ε, Var(x̄_g) − mean(σ² / n_g)). k is clamped to [5, 60]; with fewer
 * than 3 groups there is nothing to estimate τ² from, so k = 20.
 *
 * Win rates: Beta(p̄·m + W_g, (1 − p̄)·m + L_g), m = 20.
 */
import { betaPosterior, type BetaPosterior } from './dist';
import { weightedMoments } from './recency';

export const K_MIN = 5; export const K_MAX = 60; export const K_FEW = 20; export const BETA_M = 20;

export interface GroupInput { key: string; x: number[]; w: number[]; wins: number; losses: number }
export interface ShrunkGroup {
  key: string; n: number; nEff: number; rawMean: number; shrunk: number; sd: number;
  winRate: BetaPosterior;
}
export interface Shrinkage { mu: number; sigma2: number; tau2: number; k: number; pBar: number; groups: ShrunkGroup[] }

export function shrinkGroups(groups: readonly GroupInput[], opts: { prior?: { mu: number; pBar: number }; kScale?: number } = {}): Shrinkage {
  const all = groups.flatMap((g) => g.x.map((v, i) => ({ v, w: g.w[i] })));
  const global = weightedMoments(all.map((a) => a.v), all.map((a) => a.w));
  const mu = opts.prior?.mu ?? global.mean;
  const stats = groups.map((g) => ({ g, m: weightedMoments(g.x, g.w) }));
  // Pooled within-group variance, weighted by each group's effective n − 1.
  const dof = stats.reduce((a, s) => a + Math.max(0, s.m.nEff - 1), 0);
  // No within-group spread to measure (one trade per group): assume at least 1R², never the spread between two lucky points.
  const sigma2 = dof > 0 ? stats.reduce((a, s) => a + s.m.variance * Math.max(0, s.m.nEff - 1), 0) / dof : Math.max(1, global.variance || 1);
  const s2 = sigma2 > 0 ? sigma2 : (global.variance || 1);
  const usable = stats.filter((s) => s.m.nEff > 0);
  let k = K_FEW; let tau2 = NaN;
  if (usable.length >= 3) {
    const means = usable.map((s) => s.m.mean);
    const mm = means.reduce((a, b) => a + b, 0) / means.length;
    const varMeans = means.reduce((a, b) => a + (b - mm) ** 2, 0) / (means.length - 1);
    const noise = usable.reduce((a, s) => a + s2 / s.m.nEff, 0) / usable.length;
    tau2 = Math.max(1e-6, varMeans - noise);
    k = Math.min(K_MAX, Math.max(K_MIN, s2 / tau2));
  }
  // Interactions (tier 3) shrink harder: many thin cells, each one a chance to fool you.
  k *= opts.kScale ?? 1;
  const W = groups.reduce((a, g) => a + g.wins, 0); const L = groups.reduce((a, g) => a + g.losses, 0);
  const pBar = opts.prior?.pBar ?? (W + L ? W / (W + L) : 0.5);
  return {
    mu, sigma2: s2, tau2, k, pBar,
    groups: stats.map(({ g, m }) => ({
      key: g.key, n: g.x.length, nEff: m.nEff, rawMean: m.mean,
      shrunk: (m.nEff * m.mean + k * mu) / (m.nEff + k),
      sd: Math.sqrt(s2 / (m.nEff + k)),
      winRate: betaPosterior(pBar * BETA_M + g.wins, (1 - pBar) * BETA_M + g.losses),
    })),
  };
}
