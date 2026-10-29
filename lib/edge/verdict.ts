/**
 * The engine's fixed vocabulary, decided by the numbers alone:
 *
 *  - Too early: fewer than 8 trades, or the 80% interval spans both a
 *    meaningfully good and a meaningfully bad result (beyond ±0.10R).
 *  - Hint: P(effect in the stated direction) ≥ 0.75.
 *  - Likely: P ≥ 0.90 with at least 15 trades.
 *  - Confirmed: P ≥ 0.975, at least 30 trades, and it held on trades logged
 *    after the claim was made (the insight ledger) — until that ledger has a
 *    record, nothing is called Confirmed.
 */
export type VerdictLevel = 'too-early' | 'hint' | 'likely' | 'confirmed';
export const VERDICT_LABEL: Record<VerdictLevel, string> = { 'too-early': 'Too early', hint: 'Hint', likely: 'Likely', confirmed: 'Confirmed' };
export const MEANINGFUL_R = 0.1;

export interface Verdict { level: VerdictLevel; direction: 'positive' | 'negative' | null; p: number }

export function verdict(o: { n: number; pPositive: number; lo80: number; hi80: number; heldOutOfSample?: boolean }): Verdict {
  const direction = o.pPositive >= 0.5 ? 'positive' : 'negative';
  const p = direction === 'positive' ? o.pPositive : 1 - o.pPositive;
  if (o.n < 8 || (o.lo80 < -MEANINGFUL_R && o.hi80 > MEANINGFUL_R)) return { level: 'too-early', direction: null, p };
  if (p >= 0.975 && o.n >= 30 && o.heldOutOfSample) return { level: 'confirmed', direction, p };
  if (p >= 0.9 && o.n >= 15) return { level: 'likely', direction, p };
  if (p >= 0.75) return { level: 'hint', direction, p };
  return { level: 'too-early', direction: null, p };
}
