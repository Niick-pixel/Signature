/**
 * The day's rules, as numbers: the minimum confidence, and how many losses
 * end the day. Pure — the settings and the day's prep are handed in.
 */
import type { PrepData } from './prep';

export interface RuleSettings { minConfidence: number; fallbackStopAfter: number }
export const DEFAULT_RULES: RuleSettings = { minConfidence: 3, fallbackStopAfter: 2 };

/** "Stop after" from the day's chart prep: 1 loss, 2 losses, or the fallback. */
export function stopAfterFor(prep: PrepData | null, settings: RuleSettings): number {
  const answer = prep?.answers?.['session.stop'];
  if (answer === '1 loss') return 1;
  if (answer === '2 losses') return 2;
  return settings.fallbackStopAfter;
}

/** Below the minimum: confidence 1–2 when the minimum is 3. Unanswered is not below anything. */
export const belowMinConfidence = (confidence: number | null | undefined, settings: RuleSettings): boolean =>
  confidence != null && confidence > 0 && confidence < settings.minConfidence;
