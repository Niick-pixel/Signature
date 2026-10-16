/**
 * The target check: is the target the nearest clear liquidity, with a clean
 * path, worth at least MIN_R_TO_NEAREST?
 *
 * Never a gate. It is recorded as target_check_passed and said out loud in
 * the form; the trade is always saved.
 */
import type { EqhlChecks } from './types';

export const MIN_R_TO_NEAREST = 1.5;

export interface TargetCheckInput {
  target_type: string | null;
  nearest_liquidity_type: string | null;
  nearest_liquidity_price: number | null;
  opposing_swings_between: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  stop_points: number | null;
  eqhl_checks: EqhlChecks | null;
  /** The quick answer (029): '<1' | '1-1.5' | '1.5-2' | '2+'. Wins over the prices when set. */
  r_to_nearest_bucket?: string | null;
}

/** R from entry to the nearest liquidity: by the stop price, or the stop in points. */
export function rToNearest(t: Pick<TargetCheckInput, 'entry_price' | 'stop_loss' | 'stop_points' | 'nearest_liquidity_price'>): number | null {
  if (t.entry_price == null || t.nearest_liquidity_price == null) return null;
  const risk = t.stop_loss != null ? Math.abs(t.entry_price - t.stop_loss) : t.stop_points;
  if (!risk || !Number.isFinite(risk) || risk <= 0) return null;
  return Math.round((Math.abs(t.nearest_liquidity_price - t.entry_price) / risk) * 100) / 100;
}

export interface TargetVerdict {
  r: number | null;
  /** Each warning, in words. Empty = nothing to say. */
  warnings: string[];
  /** True/false once there is enough to tell; null before. */
  passed: boolean | null;
}

export function targetCheck(t: TargetCheckInput): TargetVerdict {
  const r = rToNearest(t);
  const warnings: string[] = [];
  const bucket = t.r_to_nearest_bucket ?? null;
  const known = t.nearest_liquidity_type != null || t.opposing_swings_between != null || r != null || bucket != null;
  if (t.nearest_liquidity_type && t.target_type && t.nearest_liquidity_type !== t.target_type) {
    warnings.push(`Your target (${t.target_type}) is not the nearest liquidity (${t.nearest_liquidity_type}).`);
  }
  // Under 1.5R to the nearest liquidity, or two-plus swings in the way: no trade.
  const shortR = bucket ? bucket === '<1' || bucket === '1-1.5' : r != null && r < MIN_R_TO_NEAREST;
  if (shortR || t.opposing_swings_between === '2+') {
    const why = [
      shortR ? `under ${MIN_R_TO_NEAREST}R to the nearest liquidity${!bucket && r != null ? ` (${r}R)` : ''}` : null,
      t.opposing_swings_between === '2+' ? 'two or more opposing swings in the way' : null,
    ].filter(Boolean).join(' and ');
    warnings.push(`By your rules this is no trade — ${why}.`);
  }
  if (t.target_type === 'EQH/EQL') {
    const c = t.eqhl_checks;
    if (!c || !c.touches || !c.untested || !c.in_range) warnings.push('Not a clean EQH/EQL by your definition (two touches, untested, inside the range).');
  }
  return { r, warnings, passed: known || t.target_type === 'EQH/EQL' ? warnings.length === 0 : null };
}
