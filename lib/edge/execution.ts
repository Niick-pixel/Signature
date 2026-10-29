/**
 * Execution (Edge Engine §5.8): what happened between entry and exit, from
 * the max-in-favour / max-heat buckets (or max R reached where recorded).
 * Outcome fields — diagnosis only, never a predictor.
 *
 *  - losers that reached 1R or more in favour first: a management leak
 *  - losers that never went positive: a selection or entry leak
 *  - winners that took about 1R of heat: the stop barely survived
 *  - moved to breakeven, stopped, and the target was hit later: the cost of
 *    early breakeven, in R (planned R:R − what was realised)
 *  - exit efficiency = realised R ÷ max R in favour, for winners
 *  - planned R:R against what was achieved
 */
import { resultClass } from './metrics';
import type { Trade } from '../types';

const mfeOf = (t: Trade): number | null => {
  if (t.mfe_r != null) return t.mfe_r;
  if (t.mfe_bucket == null) return null;
  return t.mfe_bucket === '3+' ? 3 : Number(t.mfe_bucket);
};
const plannedOf = (t: Trade): number | null => (t.planned_rr == null ? null : t.planned_rr === '4+' ? 4 : Number(t.planned_rr));

export interface Execution {
  losers: number; losersWithMfe: number; mgmtLeak: string[]; neverPositive: string[];
  winners: number; winnersWithMae: number; stopSurvived: string[];
  earlyBe: { ids: string[]; costR: number };
  efficiency: { n: number; mean: number | null };
  planned: Array<{ rr: string; n: number; reached: number; meanR: number }>;
}

export function execution(trades: readonly Trade[]): Execution {
  const r = (t: Trade) => t.r_multiple as number;
  const losers = trades.filter((t) => resultClass(r(t)) === 'L'); const winners = trades.filter((t) => resultClass(r(t)) === 'W');
  const lm = losers.filter((t) => mfeOf(t) != null);
  const wm = winners.filter((t) => t.mae_bucket != null);
  const be = trades.filter((t) => t.moved_to_be && t.moved_to_be !== 'No' && t.exit_reason === 'BE stop' && t.target_hit_later === 'Yes');
  const eff = winners.map((t) => { const m = mfeOf(t); return m && m > 0 ? Math.min(1, r(t) / m) : null; }).filter((v): v is number => v != null);
  const byPlan = new Map<string, Trade[]>();
  for (const t of trades) if (t.planned_rr) byPlan.set(t.planned_rr, [...(byPlan.get(t.planned_rr) ?? []), t]);
  return {
    losers: losers.length, losersWithMfe: lm.length,
    mgmtLeak: lm.filter((t) => (mfeOf(t) ?? 0) >= 1).map((t) => t.id),
    neverPositive: lm.filter((t) => (mfeOf(t) ?? 0) <= 0).map((t) => t.id),
    winners: winners.length, winnersWithMae: wm.length,
    stopSurvived: wm.filter((t) => t.mae_bucket === '~1' || t.mae_bucket === '0.75').map((t) => t.id),
    earlyBe: { ids: be.map((t) => t.id), costR: be.reduce((a, t) => a + Math.max(0, (plannedOf(t) ?? 0) - r(t)), 0) },
    efficiency: { n: eff.length, mean: eff.length ? eff.reduce((a, v) => a + v, 0) / eff.length : null },
    planned: [...byPlan].map(([rr, ts]) => ({ rr, n: ts.length, reached: ts.filter((t) => r(t) >= (plannedOf(t) ?? Infinity) * 0.9).length, meanR: ts.reduce((a, t) => a + r(t), 0) / ts.length }))
      .sort((a, b) => Number(a.rr.replace('+', '')) - Number(b.rr.replace('+', ''))),
  };
}
