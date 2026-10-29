/**
 * Setup quality (Edge Engine §6 F): do your grades mean anything?
 *
 *  - mean R by grade, shrunk (lib/edge/shrink), separately for grades locked
 *    before the outcome (clean) and grades given after it (hindsight-exposed):
 *    only the clean ones can say whether the grading works
 *  - grade drift: the honest re-grade after the close, and the blind grade
 *    (Blind Re-grade), against the grade at entry, on one scale
 *    (A+ 10, A 9, A− 8, B+ 7, B 6, B− 5, C 3.5, F 1)
 */
import { shrinkGroups } from './shrink';
import { resultClass } from './metrics';
import { Z80, Z95 } from './dist';
import type { Trade } from '../types';

export const GRADE_SCALE: Record<string, number> = { 'A+': 10, A: 9, 'A-': 8, 'B+': 7, B: 6, 'B-': 5, C: 3.5, D: 2, F: 1 };
const ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D', 'F'];

export interface GradeRow { grade: string; n: number; rawMean: number; shrunk: number; lo80: number; hi80: number; lo95: number; hi95: number; tradeIds: string[] }
export interface GradeTable { mu: number; rows: GradeRow[] }
export interface Drift { against: 'regrade' | 'blind'; n: number; mean: number | null; down: number; same: number; up: number }
export interface Quality { clean: GradeTable; exposed: GradeTable; drift: Drift[]; cleanN: number; exposedN: number }

function table(trades: readonly Trade[]): GradeTable {
  const by = new Map<string, Trade[]>();
  for (const t of trades) if (t.grade_letter) by.set(t.grade_letter, [...(by.get(t.grade_letter) ?? []), t]);
  const groups = [...by].map(([key, ts]) => { const x = ts.map((t) => t.r_multiple as number); return { key, x, w: x.map(() => 1), wins: x.filter((r) => resultClass(r) === 'W').length, losses: x.filter((r) => resultClass(r) === 'L').length }; });
  if (!groups.length) return { mu: 0, rows: [] };
  const sh = shrinkGroups(groups);
  return {
    mu: sh.mu,
    rows: sh.groups.map((g) => ({ grade: g.key, n: g.n, rawMean: g.rawMean, shrunk: g.shrunk, lo80: g.shrunk - Z80 * g.sd, hi80: g.shrunk + Z80 * g.sd, lo95: g.shrunk - Z95 * g.sd, hi95: g.shrunk + Z95 * g.sd, tradeIds: by.get(g.key)!.map((t) => t.id) }))
      .sort((a, b) => ORDER.indexOf(a.grade) - ORDER.indexOf(b.grade)),
  };
}

function drift(trades: readonly Trade[], against: Drift['against']): Drift {
  const pairs = trades.map((t) => [GRADE_SCALE[t.grade_letter ?? ''], GRADE_SCALE[(against === 'regrade' ? t.regrade : t.blind_grade) ?? '']] as const).filter(([a, b]) => a != null && b != null);
  const d = pairs.map(([a, b]) => b - a);
  return { against, n: d.length, mean: d.length ? d.reduce((a, v) => a + v, 0) / d.length : null, down: d.filter((v) => v < -0.25).length, same: d.filter((v) => Math.abs(v) <= 0.25).length, up: d.filter((v) => v > 0.25).length };
}

export function setupQuality(trades: readonly Trade[]): Quality {
  const clean = trades.filter((t) => !t.graded_post_hoc); const exposed = trades.filter((t) => t.graded_post_hoc);
  return { clean: table(clean), exposed: table(exposed), drift: [drift(trades, 'regrade'), drift(trades, 'blind')], cleanN: clean.length, exposedN: exposed.length };
}
