/**
 * The questions the journal exists to answer, as numbers.
 *
 *   honesty      % of taken trades graded before the outcome — the only
 *                ones whose grade is evidence of anything
 *   breakdowns   expectancy and W/L/BE by target type, confidence, rules,
 *                premium/discount, target check and breakeven trigger
 *   samples      how far each rubric version is from a sample worth reading
 *   earlyBE      breakevens that had already run 0.7R or more
 */
import { adherenceOf } from './adherence';
import { isTaken } from './domain';
import type { Trade } from './types';

export const RUBRIC_SAMPLE = 50;
export const EARLY_BE_R = 0.7;

const taken = (ts: readonly Trade[]) => ts.filter((t) => isTaken(t.outcome) && t.status !== 'Planned' && !t.deleted_at);

export interface Honesty { n: number; preGraded: number; pct: number | null }
export function honesty(trades: readonly Trade[]): Honesty {
  const ts = taken(trades);
  const pre = ts.filter((t) => !t.graded_post_hoc).length;
  return { n: ts.length, preGraded: pre, pct: ts.length ? Math.round((pre / ts.length) * 100) : null };
}

export interface Row { key: string; n: number; w: number; l: number; be: number; expectancy: number | null; totalR: number }

export function breakdown(trades: readonly Trade[], keyOf: (t: Trade) => string, order: readonly string[] = []): Row[] {
  const groups = new Map<string, Trade[]>();
  for (const t of taken(trades)) groups.set(keyOf(t), [...(groups.get(keyOf(t)) ?? []), t]);
  const rows = [...groups].map(([key, ts]): Row => {
    const rs = ts.map((t) => t.r_multiple).filter((r): r is number => r != null);
    const total = rs.reduce((s, r) => s + r, 0);
    return {
      key, n: ts.length,
      w: ts.filter((t) => t.outcome === 'Win').length,
      l: ts.filter((t) => t.outcome === 'Loss').length,
      be: ts.filter((t) => t.outcome === 'Breakeven').length,
      expectancy: rs.length ? Math.round((total / rs.length) * 100) / 100 : null,
      totalR: Math.round(total * 100) / 100,
    };
  });
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length + 1);
  return rows.sort((a, b) => rank(a.key) - rank(b.key) || b.n - a.n);
}

export const DIMENSIONS: Array<{ id: string; title: string; key: (t: Trade) => string; order?: string[] }> = [
  { id: 'target', title: 'By target type', key: (t) => t.target_type },
  { id: 'confidence', title: 'By confidence', key: (t) => (t.confidence_at_entry ? '★'.repeat(t.confidence_at_entry) : 'Not set'),
    order: ['★', '★★', '★★★', '★★★★', '★★★★★', 'Not set'] },
  { id: 'rules', title: 'By followed rules', key: (t) => ({ followed: 'Followed', broken: 'Broke a rule', unscored: 'Not scored' })[adherenceOf(t)],
    order: ['Followed', 'Broke a rule', 'Not scored'] },
  { id: 'pd', title: 'By premium / discount', key: (t) => t.premium_discount, order: ['Discount', 'Equilibrium', 'Premium'] },
  { id: 'targetCheck', title: 'By target check', key: (t) => (t.target_check_passed == null ? 'Not checked' : t.target_check_passed ? 'Passed' : 'Failed'),
    order: ['Passed', 'Failed', 'Not checked'] },
  { id: 'be', title: 'By breakeven trigger', key: (t) => t.be_trigger ?? 'Not set', order: ['1R', 'Structure break', 'None', 'Not set'] },
];

export interface RubricSample { version: number; n: number; preGraded: number; need: number }
/** Per rubric version: taken trades, and how many of them were graded before the outcome. */
export function rubricSamples(trades: readonly Trade[]): RubricSample[] {
  const by = new Map<number, Trade[]>();
  for (const t of taken(trades)) by.set(t.rubric_version, [...(by.get(t.rubric_version) ?? []), t]);
  return [...by].sort((a, b) => b[0] - a[0]).map(([version, ts]) => ({
    version, n: ts.length, preGraded: ts.filter((t) => !t.graded_post_hoc).length, need: RUBRIC_SAMPLE,
  }));
}

export interface EarlyBE { breakevens: number; early: Trade[] }
/** Breakevens whose max R reached was 0.7 or more: moved to BE too early? */
export function earlyBreakevens(trades: readonly Trade[]): EarlyBE {
  const bes = taken(trades).filter((t) => t.outcome === 'Breakeven');
  return { breakevens: bes.length, early: bes.filter((t) => t.mfe_r != null && t.mfe_r >= EARLY_BE_R) };
}
