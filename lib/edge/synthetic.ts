/**
 * Synthetic trades with a known, injected effect — to prove the engine finds a
 * real pattern when there is enough data and says "Too early" when there is
 * not. Seeded, so every run is identical. Used by tests and by
 * scripts/gen-fake-trades.ts; never by the app.
 */
import { ENTRY_METHODS, FVG_QUALITIES, LIQUIDITY_EVENTS, PLANNED_RRS, SMT_STATES, STOP_METHODS, TIMEFRAMES } from '../anatomy';
import { mulberry32 } from './rng';
import type { Trade } from '../types';

export interface SyntheticOptions {
  /** R added to every trade whose liquidity event is None. */
  effect?: number;
  /** Share of trades with no liquidity event. */
  noneShare?: number;
  /** Mean R of everything else, and the spread of all results. */
  base?: number; sd?: number;
}

export function genFakeTrades(n: number, seed = 1, o: SyntheticOptions = {}): Trade[] {
  const rand = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  // Box–Muller on the seeded stream.
  const gauss = () => { const u = Math.max(1e-12, rand()); const v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const effect = o.effect ?? -0.5; const share = o.noneShare ?? 1 / 3; const base = o.base ?? 0.2; const sd = o.sd ?? 0.7;
  const events = LIQUIDITY_EVENTS.filter((e) => e !== 'None');
  return Array.from({ length: n }, (_, i) => {
    const none = rand() < share;
    const r = Math.round((base + (none ? effect : 0) + sd * gauss()) * 100) / 100;
    const day = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    return {
      id: `fake-${seed}-${i}`, date: `${day}T08:30`, created_at: `${day}T15:00:00.000Z`, updated_at: `${day}T15:00:00.000Z`,
      account: 'Demo', outcome: r > 0.1 ? 'Win' : r < -0.1 ? 'Loss' : 'Breakeven', r_multiple: r, status: 'Settled', setup_type: 'iFVG',
      direction: rand() < 0.5 ? 'Long' : 'Short', session: pick(['London', 'NY AM', 'NY PM'] as const), chk_killzone: true,
      htf_bias: pick(['With bias', 'Against bias'] as const), premium_discount: pick(['Discount', 'Premium', 'Equilibrium'] as const),
      liquidity_event: none ? 'None' : pick(events), sweep_tf: pick(TIMEFRAMES), entry_tf: pick(TIMEFRAMES),
      fvg_quality: pick(FVG_QUALITIES), entry_method: pick(ENTRY_METHODS), stop_method: pick(STOP_METHODS),
      smt_state: pick(SMT_STATES), planned_rr: pick(PLANNED_RRS),
      candle_strength: Math.floor(rand() * 5), inversion_speed: Math.floor(rand() * 4), rr_score: Math.floor(rand() * 4),
      rubric_version: 3, graded_post_hoc: false, mistake_tags: [], rule_breaks_manual: [],
    } as unknown as Trade;
  });
}
