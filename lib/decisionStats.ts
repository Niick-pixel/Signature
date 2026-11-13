import { ROWS, isRubricV2, type RowKey } from './decision';
import type { Trade } from './types';

/**
 * Stats for Rubric v2 (4 rows) trades only — the old checklist's scale never
 * mixes in. Expectancy is R per trade: what taken trades made, and what passes
 * and misses would have made (their hypothetical R). Re-grades are stored and
 * never read here. Pure.
 */

export interface Cell { n: number; avgR: number | null }
export interface DecisionStats {
  /** Decided under v2, outcome written. */
  n: number;
  byTotal: Array<{ total: number; taken: Cell; passed: number; missed: number }>;
  byRow: Record<RowKey, Record<0 | 1 | 2, Cell>>;
  byScenario: Array<{ key: 'A' | 'B' | 'none'; label: string; cell: Cell }>;
  /** Seconds to decide, in buckets of the limit's quarters (timed decisions only), and the misses. */
  time: { buckets: Array<{ label: string; n: number }>; timed: number; missed: number; median: number | null };
  decisions: Array<{ key: 'take' | 'pass' | 'missed'; label: string; cell: Cell; hypothetical: boolean }>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const cellOf = (rs: Array<number | null>): Cell => { const v = rs.filter((x): x is number => x != null); return { n: v.length, avgR: mean(v) }; };
/** What a v2 record made or would have made. */
export const v2R = (t: Pick<Trade, 'decision' | 'r_multiple' | 'would_be_r'>): number | null => (t.decision === 'take' ? t.r_multiple : t.would_be_r);

export function decisionStats(trades: readonly Trade[]): DecisionStats {
  const v2 = trades.filter((t) => isRubricV2(t) && t.decided_at && t.outcome_at && !t.deleted_at);
  const taken = v2.filter((t) => t.decision === 'take');
  const totalOf = (t: Trade) => ROWS.reduce((s, r) => s + (t[r.key] ?? 0), 0);
  const complete = (t: Trade) => ROWS.every((r) => t[r.key] != null);

  const byTotal = Array.from({ length: 9 }, (_, total) => {
    const at = v2.filter((t) => complete(t) && totalOf(t) === total);
    return { total, taken: cellOf(at.filter((t) => t.decision === 'take').map((t) => t.r_multiple)), passed: at.filter((t) => t.decision === 'pass').length, missed: at.filter((t) => t.decision === 'missed').length };
  });
  const byRow = Object.fromEntries(ROWS.map((r) => [r.key, Object.fromEntries(([0, 1, 2] as const).map((s) =>
    [s, cellOf(taken.filter((t) => t[r.key] === s).map((t) => t.r_multiple))]))])) as DecisionStats['byRow'];
  const byScenario = (['A', 'B', 'none'] as const).map((key) => ({
    key, label: key === 'none' ? 'Unplanned' : `Scenario ${key}`, cell: cellOf(taken.filter((t) => t.plan_scenario === key).map((t) => t.r_multiple)),
  }));

  const timed = v2.filter((t) => t.decision_limit != null && t.decision_seconds != null);
  const limit = Math.max(1, ...timed.map((t) => t.decision_limit as number));
  const q = limit / 4;
  const buckets = [0, 1, 2, 3].map((i) => ({
    label: `${Math.round(i * q)}–${Math.round((i + 1) * q)}s`,
    n: timed.filter((t) => t.decision !== 'missed' && (t.decision_seconds as number) >= i * q && ((t.decision_seconds as number) < (i + 1) * q || (i === 3 && (t.decision_seconds as number) <= limit))).length,
  }));
  const missed = timed.filter((t) => t.decision === 'missed').length;
  buckets.push({ label: 'Missed', n: missed });
  const secs = timed.filter((t) => t.decision !== 'missed').map((t) => t.decision_seconds as number).sort((a, b) => a - b);
  const median = secs.length ? secs[Math.floor(secs.length / 2)] : null;

  const decisions = (['take', 'pass', 'missed'] as const).map((key) => ({
    key, label: key === 'take' ? 'Taken' : key === 'pass' ? 'Passed' : 'Missed — too slow',
    cell: cellOf(v2.filter((t) => t.decision === key).map(v2R)), hypothetical: key !== 'take',
  }));

  return { n: v2.length, byTotal, byRow, byScenario, time: { buckets, timed: timed.length, missed, median }, decisions };
}
