import 'server-only';
import { getPrep } from './prep';
import { getDailyReview } from './reviews';
import { getRuleSettings } from './rules';
import { listTrades } from './trades';
import { getDb } from './index';
import { countsInStats } from '../lib/domain';
import { stopAfterFor } from '../lib/rules';
import { DEFAULT_RULE_CONFIG, type DayContext, type RuleConfig } from '../lib/ruleBook';
import type { Trade } from '../lib/types';

/**
 * What the review engine needs from the database: the trades that count
 * (Hindsight stays out, as everywhere), each day's context — a red-folder
 * day from the morning check-in, the "stop after" from the prep — and the
 * rule settings.
 */
export function reviewInputs(): { trades: Trade[]; ctxFor: (day: string) => DayContext; cfg: RuleConfig } {
  const settings = getRuleSettings();
  const cache = new Map<string, DayContext>();
  const ctxFor = (day: string): DayContext => {
    if (!cache.has(day)) {
      const prep = getPrep(day)?.data ?? null;
      cache.set(day, {
        redFolder: getDailyReview(day)?.news === 'High',
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

/** This week's chosen focus rule (app_settings 'focus:<monday>'), or null when none was chosen. */
export function getFocus(monday: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(`focus:${monday}`) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setFocus(monday: string, ruleId: string): void {
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(`focus:${monday}`, ruleId);
}
