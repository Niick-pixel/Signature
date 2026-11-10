import 'server-only';
import { reviewInputs } from './review';
import { listInsights, listThemeWords } from './edge';
import { dayBreaksByTrade, fieldEras, planBreaks } from '../lib/review';
import { adjustedThresholds, type StoredClaim } from '../lib/edge/claims';
import type { Trade } from '../lib/types';

/**
 * What every Edge Engine reading needs besides the trades: the rule breaks
 * of each trade (one definition — lib/review planBreaks), the day context,
 * your theme dictionary, and the verdict thresholds the insight ledger has
 * earned. The Stats page and the Flaw Deck both take them from here, so the
 * two can never read the same trade differently.
 */
export function edgeInputs() {
  const { trades: allTrades, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(allTrades, ctxFor, cfg);
  const eras = fieldEras(allTrades);
  const breaksOf = (t: Trade) => planBreaks(t, breaks, cfg, eras);
  const claimsBefore = listInsights() as StoredClaim[];
  const { thresholds, changes: thresholdChanges } = adjustedThresholds(claimsBefore);
  return { allTrades, ctxFor, cfg, breaks, eras, breaksOf, claimsBefore, thresholds, thresholdChanges, themeWords: listThemeWords() };
}
