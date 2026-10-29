/**
 * The setup's anatomy (Edge Engine, migration 036): structured, tap-chip
 * answers for what the screenshot shows, so the engine can measure them —
 * timeframes, the liquidity event, the inversion candle, how you entered and
 * where the stop went — and how the trade was managed and ended. No prices are
 * ever typed. Every field is optional; a blank is "not recorded", never "no".
 */
export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '1H'] as const;
export const BIAS_TIMEFRAMES = ['1H', '4H', 'Daily'] as const;
export const LIQUIDITY_EVENTS = ['PDH/PDL', 'PWH/PWL', 'Asia H/L', 'London H/L', 'EQH/EQL', 'ITH/ITL', 'HTF FVG delivery', 'OB delivery', 'None'] as const;
export const FVG_QUALITIES = ['Displacement', 'Drift'] as const;
export const SMT_STATES = ['Agrees', 'Diverges (confirming)', 'None'] as const;
export const PLANNED_RRS = ['1', '1.5', '2', '3', '4+'] as const;
export const ENTRY_METHODS = ['On inversion close', 'Retrace into FVG', 'CE of FVG', 'Before close (anticipation)'] as const;
export const STOP_METHODS = ['Beyond sweep wick', 'Beyond FVG', 'Widened for HTF FVG', 'Other'] as const;
export const EXIT_REASONS = ['TP', 'SL', 'BE stop', 'Manual early', 'Manual late', 'Time'] as const;
export const MFE_BUCKETS = ['0', '0.25', '0.5', '1', '1.5', '2', '3+'] as const;
export const MAE_BUCKETS = ['0.25', '0.5', '0.75', '~1'] as const;
export const TRI_ANSWERS = ['Yes', 'No', 'Unknown'] as const;
export const MOVED_TO_BE = ['No', 'After 0.5R', 'After 1R', 'After 1.5R+'] as const;
export const EMOTIONS_AFTER = ['Calm', 'Relieved', 'Confident', 'Frustrated', 'Anxious', 'Tilted'] as const;

/** Dodgy's inversion-candle rating: candle strength 0–4, inversion speed 0–3, R:R 0–3. */
export const CANDLE_MAX = { candle_strength: 4, inversion_speed: 3, rr_score: 3 } as const;

/** The closure score out of 10, or null until all three parts are rated. */
export function closureScore(t: { candle_strength?: number | null; inversion_speed?: number | null; rr_score?: number | null }): number | null {
  if (t.candle_strength == null || t.inversion_speed == null || t.rr_score == null) return null;
  return t.candle_strength + t.inversion_speed + t.rr_score;
}

/** 10 A+, 9 A, 8 A-, 7 B+, 6 B, 5 B-, 3–4 C, 0–2 F. */
export function closureLetter(score: number | null): string | null {
  if (score == null) return null;
  return score >= 10 ? 'A+' : score === 9 ? 'A' : score === 8 ? 'A-' : score === 7 ? 'B+' : score === 6 ? 'B' : score === 5 ? 'B-' : score >= 3 ? 'C' : 'F';
}

export type Timeframe = (typeof TIMEFRAMES)[number];
export type LiquidityEvent = (typeof LIQUIDITY_EVENTS)[number];
