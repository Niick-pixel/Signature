/**
 * Maturity tiers: what the engine is allowed to say grows with the evidence.
 *
 *  - Tier 0 (under 30 trades in view): integrity, descriptive numbers with
 *    intervals, adherence, the computer's rule checks, Monte Carlo. Every
 *    slice says Too early unless the gap is extreme.
 *  - Tier 1 (30–99): the anatomy explorer, grade calibration, mistake-theme
 *    costs, the Rule Lab, similar setups.
 *  - Tier 2 (100–199): the learned score visibly leaves your weights;
 *    walk-forward skill means something; recency weighting on by default.
 *  - Tier 3 (200+): two-way interactions (strongly shrunk) and a regime split.
 */
export type Feature = 'explorer' | 'gradeCalibration' | 'themeCosts' | 'ruleLab' | 'similar' | 'scoreModel' | 'walkForward' | 'recencyDefault' | 'interactions' | 'regimes';

export const TIERS = [
  { tier: 0, from: 0, unlocks: 'Integrity, your edge with intervals, adherence, rule checks, Monte Carlo' },
  { tier: 1, from: 30, unlocks: 'Setup anatomy, grade calibration, mistake-theme costs, Rule Lab, similar setups' },
  { tier: 2, from: 100, unlocks: 'Learned score weights, walk-forward skill, recency weighting by default' },
  { tier: 3, from: 200, unlocks: 'Two-way interactions and a regime split' },
] as const;

export const FEATURE_TIER: Record<Feature, number> = {
  explorer: 1, gradeCalibration: 1, themeCosts: 1, ruleLab: 1, similar: 1,
  scoreModel: 2, walkForward: 2, recencyDefault: 2, interactions: 3, regimes: 3,
};

export interface Maturity { n: number; tier: number; next: number | null; toNext: number | null; progress: number; nextUnlocks: string | null }

export function maturity(n: number): Maturity {
  const cur = [...TIERS].reverse().find((t) => n >= t.from)!;
  const nxt = TIERS.find((t) => t.from > n) ?? null;
  return {
    n, tier: cur.tier, next: nxt?.from ?? null, toNext: nxt ? nxt.from - n : null,
    progress: nxt ? (n - cur.from) / (nxt.from - cur.from) : 1, nextUnlocks: nxt?.unlocks ?? null,
  };
}

export const unlocked = (m: Maturity, f: Feature) => m.tier >= FEATURE_TIER[f];
