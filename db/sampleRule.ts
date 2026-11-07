import 'server-only';
import { getDb } from './index';
import { STOP_PLACEMENTS, type StopPlacement } from '../lib/domain';

/*
  The current backtest sample's stop rule: one placement the sample is meant
  to hold to, so the sample measures one plan. Optional — unset, nothing is
  shown. It is information beside the field, never a check that blocks.
*/
const KEY = 'backtest_stop_rule';

export function getSampleStopRule(): StopPlacement | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(KEY) as { value: string } | undefined;
  return row && (STOP_PLACEMENTS as readonly string[]).includes(row.value) ? row.value as StopPlacement : null;
}

/** Set the rule, or clear it with null. Anything that is not a placement clears it. */
export function setSampleStopRule(rule: unknown): StopPlacement | null {
  const v = typeof rule === 'string' && (STOP_PLACEMENTS as readonly string[]).includes(rule) ? rule as StopPlacement : null;
  if (v) getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, v);
  else getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(KEY);
  return v;
}
