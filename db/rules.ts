import 'server-only';
import { getDb } from './index';
import { getPrep } from './prep';
import { listTrades } from './trades';
import { DEFAULT_RULES, belowMinConfidence, stopAfterFor, type RuleSettings } from '../lib/rules';
import { targetCheck } from '../lib/targetCheck';
import { adherenceOf } from '../lib/adherence';
import { isBacktest, isTaken, marketDay } from '../lib/domain';
import type { Trade, TradeInput } from '../lib/types';

/* --------------------------------------------------------------- settings */

export function getRuleSettings(): RuleSettings {
  const rows = getDb().prepare("SELECT key, value FROM app_settings WHERE key IN ('min_confidence','fallback_stop_after_losses')")
    .all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const pos = (v: number | undefined, d: number) => (v != null && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    minConfidence: pos(map.get('min_confidence'), DEFAULT_RULES.minConfidence),
    fallbackStopAfter: pos(map.get('fallback_stop_after_losses'), DEFAULT_RULES.fallbackStopAfter),
  };
}

export function setRuleSettings(next: Partial<RuleSettings>): RuleSettings {
  const put = getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (next.minConfidence != null) put.run('min_confidence', String(Math.max(0, Math.min(5, Math.round(next.minConfidence)))));
  if (next.fallbackStopAfter != null) put.run('fallback_stop_after_losses', String(Math.max(0, Math.round(next.fallbackStopAfter))));
  return getRuleSettings();
}

/* ------------------------------------------------------------------ rules */

/**
 * Everything the server decides about a trade on its way in, whatever the
 * form sent:
 *
 * - The grade lock. A new trade is locked at its first save; one saved
 *   Planned or Live was graded before its outcome existed (graded_post_hoc
 *   false), anything else after. An edit never changes either — and an old
 *   Planned trade (from before the lock) locks the moment it leaves Planned.
 * - The target check: R to the nearest liquidity and the verdict, recomputed.
 * - Confidence below the minimum, on a taken trade: the mistake tag, "did not
 *   follow the rules", and below_min_confidence. Only on trades of this era
 *   (new ones, or ones already carrying a lock) — an old trade's meaning is
 *   never rewritten by an edit.
 */
export function applyRules(input: TradeInput, before: Trade | null, settings = getRuleSettings()): TradeInput {
  const out: TradeInput = { ...input };
  const now = new Date().toISOString();

  if (!before) {
    out.grade_locked_at = now;
    out.graded_post_hoc = !(input.status === 'Planned' || input.status === 'Live');
  } else {
    out.graded_post_hoc = before.graded_post_hoc;
    out.grade_locked_at = before.grade_locked_at
      ?? (before.status === 'Planned' && input.status !== 'Planned' ? now : null);
  }

  const verdict = targetCheck(out);
  out.r_to_nearest = verdict.r;
  out.target_check_passed = verdict.passed;

  const newEra = !before || before.grade_locked_at != null || before.below_min_confidence != null;
  if (newEra) {
    const below = isTaken(out.outcome) && out.status !== 'Planned' && belowMinConfidence(out.confidence_at_entry, settings);
    out.below_min_confidence = below;
    if (below) {
      if (!out.mistake_tags.includes('Low confidence entry')) out.mistake_tags = [...out.mistake_tags, 'Low confidence entry'];
      out.followed_rules = false;
    }
  } else {
    out.below_min_confidence = before.below_min_confidence;
  }
  return out;
}

/* ------------------------------------------------------- the day's limits */

export interface DayLimit { day: string | null; stopAfter: number; losses: number; reached: boolean }

/**
 * How many losses this account already has on this market day, against the
 * day's "stop after" (from that day's chart prep, or the setting). A
 * backtest's day is its chart date.
 */
export function dayLimit(account: string, day: string | null, excludeId: string | null = null, settings = getRuleSettings()): DayLimit {
  const stopAfter = stopAfterFor(day ? getPrep(day)?.data ?? null : null, settings);
  if (!day) return { day, stopAfter, losses: 0, reached: false };
  const losses = listTrades().filter((t) => t.id !== excludeId && t.account === account && t.outcome === 'Loss'
    && marketDay(t) === day).length;
  return { day, stopAfter, losses, reached: stopAfter > 0 && losses >= stopAfter };
}

/* ------------------------------------------------------- what the form needs */

export interface Record3 { n: number; w: number; l: number; be: number; totalR: number }

const record = (ts: Trade[]): Record3 => ({
  n: ts.length,
  w: ts.filter((t) => t.outcome === 'Win').length,
  l: ts.filter((t) => t.outcome === 'Loss').length,
  be: ts.filter((t) => t.outcome === 'Breakeven').length,
  totalR: Math.round(ts.reduce((s, t) => s + (t.r_multiple ?? 0), 0) * 100) / 100,
});

export interface GuardContext {
  settings: RuleSettings;
  /** My own record when I took a trade below the minimum confidence. */
  lowConfidence: Record3;
  /** My own record on EQH/EQL targets. */
  eqhl: Record3;
  limit: DayLimit;
  /** The last late-night replay session (logged after 21:00), for the late notice. */
  lateNight: { day: string; trades: number; breaks: number } | null;
}

/**
 * Live numbers for the trade form, from my own trades: same world as the
 * account (backtests with backtests, real with real).
 */
export function guardContext(account: string, day: string | null, excludeId: string | null): GuardContext {
  const settings = getRuleSettings();
  const backtest = isBacktest(account);
  const world = listTrades().filter((t) => t.id !== excludeId && isTaken(t.outcome) && t.account !== 'Missed'
    && isBacktest(t.account) === backtest);
  const low = world.filter((t) => belowMinConfidence(t.confidence_at_entry, settings));
  const eqhl = world.filter((t) => t.target_type === 'EQH/EQL');

  // Late-night replays, grouped by the evening they were logged on.
  let lateNight: GuardContext['lateNight'] = null;
  if (backtest) {
    const nights = new Map<string, Trade[]>();
    const today = new Date().toLocaleDateString('en-CA');
    for (const t of world) {
      const at = new Date(t.created_at.endsWith('Z') ? t.created_at : `${t.created_at}Z`);
      if (at.getHours() < 21) continue;
      const night = at.toLocaleDateString('en-CA');
      if (night >= today) continue;
      nights.set(night, [...(nights.get(night) ?? []), t]);
    }
    const last = [...nights.keys()].sort().pop();
    if (last) {
      const ts = nights.get(last)!;
      // A rule break is what the checklist or my own answer says — never a tag.
      const breaks = ts.filter((t) => t.followed_rules === false || adherenceOf(t) === 'broken').length;
      lateNight = { day: last, trades: ts.length, breaks };
    }
  }
  return { settings, lowConfidence: record(low), eqhl: record(eqhl), limit: dayLimit(account, day, excludeId, settings), lateNight };
}
