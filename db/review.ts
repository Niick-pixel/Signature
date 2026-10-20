import 'server-only';
import { getPrep } from './prep';
import { getRuleSettings } from './rules';
import { listTrades } from './trades';
import { countsInStats } from '../lib/domain';
import { stopAfterFor } from '../lib/rules';
import { DEFAULT_RULE_CONFIG, type DayContext, type RuleConfig } from '../lib/ruleBook';
import type { Trade } from '../lib/types';

/**
 * What the review engine needs from the database: the trades that count
 * (Hindsight stays out, as everywhere), each day's context from that
 * morning's prep — the news, the "stop after" — and the rule settings.
 */
export function reviewInputs(): { trades: Trade[]; ctxFor: (day: string) => DayContext; cfg: RuleConfig } {
  const settings = getRuleSettings();
  const cache = new Map<string, DayContext>();
  const ctxFor = (day: string): DayContext => {
    if (!cache.has(day)) {
      const prep = getPrep(day)?.data ?? null;
      cache.set(day, {
        newsInKillzone: prep?.answers['session.news'] === 'Inside the killzone',
        maxLosses: stopAfterFor(prep, settings),
      });
    }
    return cache.get(day)!;
  };
  return {
    trades: listTrades().filter(countsInStats),
    ctxFor,
    cfg: { ...DEFAULT_RULE_CONFIG, maxLosses: settings.fallbackStopAfter || DEFAULT_RULE_CONFIG.maxLosses },
  };
}
