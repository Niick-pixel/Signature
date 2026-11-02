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
import { FIELDS } from './fields';
import { TAKE_IT_THRESHOLD } from '../domain';

export const GRADE_SCALE: Record<string, number> = { 'A+': 10, A: 9, 'A-': 8, 'B+': 7, B: 6, 'B-': 5, C: 3.5, D: 2, F: 1 };
const ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D', 'F'];

export interface GradeRow { grade: string; n: number; rawMean: number; shrunk: number; lo80: number; hi80: number; lo95: number; hi95: number; tradeIds: string[] }
export interface GradeTable { mu: number; rows: GradeRow[] }
export interface Drift { against: 'regrade' | 'blind'; n: number; mean: number | null; down: number; same: number; up: number }
/**
 * The variance check: does a filter filter? A grade given before the outcome
 * that is always the same letter, or a checklist item ticked yes on nearly
 * every trade, cannot separate good setups from bad — no model can learn from
 * it, and it is the first sign the checklist is confirming a decision already
 * made rather than making one.
 */
export interface SpreadItem { key: string; label: string; yes: number; answered: number; share: number | null; notFiltering: boolean }
export interface Spread {
  /** Grades locked before the outcome, by letter. */
  grades: Array<{ grade: string; n: number; share: number }>; gradeN: number;
  /** Every pre-graded trade has the same letter (from 8 trades). */
  oneGrade: string | null;
  items: SpreadItem[];
  /** Checklist scores (pre-graded): how many distinct values, and the share at or above the take-it line. */
  scores: { n: number; distinct: number; atOrAbove: number; threshold: number };
}
export const NOT_FILTERING = 0.9; export const SPREAD_MIN = 10;
export interface Quality { clean: GradeTable; exposed: GradeTable; drift: Drift[]; cleanN: number; exposedN: number; spread: Spread }

/** Mean R by a grade (the grade at entry, or another: the blind grade), shrunk. */
export function gradeTable(trades: readonly Trade[], gradeOf: (t: Trade) => string | null = (t) => t.grade_letter): GradeTable {
  const by = new Map<string, Trade[]>();
  for (const t of trades) { const g = gradeOf(t); if (g) by.set(g, [...(by.get(g) ?? []), t]); }
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

export function spread(trades: readonly Trade[]): Spread {
  const clean = trades.filter((t) => !t.graded_post_hoc && t.grade_letter);
  const letters = [...new Set(clean.map((t) => t.grade_letter as string))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const grades = letters.map((g) => { const n = clean.filter((t) => t.grade_letter === g).length; return { grade: g, n, share: n / clean.length }; });
  const items = FIELDS.filter((f) => f.points != null).map((f) => {
    const vals = trades.map((t) => f.get(t)).filter((v) => v != null);
    const yes = vals.filter(Boolean).length;
    const share = vals.length ? yes / vals.length : null;
    return { key: f.key, label: f.label, yes, answered: vals.length, share, notFiltering: vals.length >= SPREAD_MIN && share != null && share > NOT_FILTERING };
  });
  const pre = trades.filter((t) => !t.graded_post_hoc && t.checklist_score != null);
  return {
    grades, gradeN: clean.length, oneGrade: clean.length >= 8 && letters.length === 1 ? letters[0] : null, items,
    scores: { n: pre.length, distinct: new Set(pre.map((t) => t.checklist_score)).size, atOrAbove: pre.filter((t) => t.checklist_score >= TAKE_IT_THRESHOLD).length, threshold: TAKE_IT_THRESHOLD },
  };
}

export function setupQuality(trades: readonly Trade[]): Quality {
  const clean = trades.filter((t) => !t.graded_post_hoc); const exposed = trades.filter((t) => t.graded_post_hoc);
  return { clean: gradeTable(clean), exposed: gradeTable(exposed), drift: [drift(trades, 'regrade'), drift(trades, 'blind')], cleanN: clean.length, exposedN: exposed.length, spread: spread(trades) };
}
