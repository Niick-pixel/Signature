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
import { ROWS, plannedRNumber, rubricFamily, step1EditedAfterOutcome, type RubricFamily } from '../decision';
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
export interface SpreadItem {
  key: string; label: string;
  /** Legacy: ticked yes. v2: scored 2/2. */
  yes: number; answered: number; share: number | null; notFiltering: boolean;
  /** v2 only: how many trades scored 0, 1 and 2 on the row. */
  dist?: [number, number, number];
}
export interface Spread {
  /** The rubric family it reads: legacy (checklist items, ticked yes) or v2 (rows, scored 0/1/2). Never both. */
  family: RubricFamily;
  /** v2 only: the gates that make a setup No trade whatever its rows say. */
  gates?: { n: number; manyGaps: number; lowR: number };
  /** Grades locked before the outcome, by letter. */
  grades: Array<{ grade: string; n: number; share: number }>; gradeN: number;
  /** Every pre-graded trade has the same letter (from 8 trades). */
  oneGrade: string | null;
  items: SpreadItem[];
  /** Checklist scores (pre-graded): how many distinct values, and the share at or above the take-it line. */
  scores: { n: number; distinct: number; atOrAbove: number; threshold: number };
}
export const NOT_FILTERING = 0.9; export const SPREAD_MIN = 10;
export interface Quality { family: RubricFamily; clean: GradeTable; exposed: GradeTable; drift: Drift[]; cleanN: number; exposedN: number; spread: Spread }

/** Mean R by a grade (the grade at entry, or another: the blind grade), shrunk. */
export function gradeTable(trades: readonly Trade[], gradeOf: (t: Trade) => string | null = (t) => t.grade_letter, family: RubricFamily = 'legacy'): GradeTable {
  const by = new Map<string, Trade[]>();
  // One scale at a time: an old checklist A and a v2 A are different grades.
  for (const t of trades) { if (rubricFamily(t) !== family) continue; const g = gradeOf(t); if (g) by.set(g, [...(by.get(g) ?? []), t]); }
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

/** A v2 grade was locked at the decision; only a Step 1 edited after the outcome (049) was given knowing the result. */
const gradedBlind = (t: Trade): boolean => (rubricFamily(t) === 'v2' ? !step1EditedAfterOutcome(t) : !t.graded_post_hoc);

export function spread(trades: readonly Trade[], family: RubricFamily = 'legacy'): Spread {
  if (family === 'v2') return spreadV2(trades.filter((t) => rubricFamily(t) === 'v2'));
  const clean = trades.filter((t) => rubricFamily(t) === 'legacy' && !t.graded_post_hoc && t.grade_letter);
  const letters = [...new Set(clean.map((t) => t.grade_letter as string))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const grades = letters.map((g) => { const n = clean.filter((t) => t.grade_letter === g).length; return { grade: g, n, share: n / clean.length }; });
  const items = FIELDS.filter((f) => f.points != null).map((f) => {
    const vals = trades.filter((t) => rubricFamily(t) === 'legacy').map((t) => f.get(t)).filter((v) => v != null);
    const yes = vals.filter(Boolean).length;
    const share = vals.length ? yes / vals.length : null;
    return { key: f.key, label: f.label, yes, answered: vals.length, share, notFiltering: vals.length >= SPREAD_MIN && share != null && share > NOT_FILTERING };
  });
  const pre = trades.filter((t) => rubricFamily(t) === 'legacy' && !t.graded_post_hoc && t.checklist_score != null);
  return {
    family: 'legacy', grades, gradeN: clean.length, oneGrade: clean.length >= 8 && letters.length === 1 ? letters[0] : null, items,
    scores: { n: pre.length, distinct: new Set(pre.map((t) => t.checklist_score)).size, atOrAbove: pre.filter((t) => t.checklist_score >= TAKE_IT_THRESHOLD).length, threshold: TAKE_IT_THRESHOLD },
  };
}

/**
 * Rubric v2's spread: each row's 0 / 1 / 2 distribution. A row scored 2/2 on
 * more than 90% of 10+ trades is not filtering — the same rule as a checklist
 * item ticked yes. And the gates, counted apart: more than one gap, planned R
 * under 1.5 (either is No trade, whatever the rows say).
 */
function spreadV2(v2: readonly Trade[]): Spread {
  const clean = v2.filter((t) => gradedBlind(t) && t.grade_letter);
  const order = ['A+', 'A', 'B', 'F'];
  const letters = [...new Set(clean.map((t) => t.grade_letter as string))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const grades = letters.map((g) => { const n = clean.filter((t) => t.grade_letter === g).length; return { grade: g, n, share: n / clean.length }; });
  const items: SpreadItem[] = ROWS.map((r) => {
    const vals = v2.map((t) => t[r.key]).filter((v): v is number => v === 0 || v === 1 || v === 2);
    const dist: [number, number, number] = [vals.filter((v) => v === 0).length, vals.filter((v) => v === 1).length, vals.filter((v) => v === 2).length];
    const share = vals.length ? dist[2] / vals.length : null;
    return { key: r.key, label: r.label, yes: dist[2], answered: vals.length, share, dist, notFiltering: vals.length >= SPREAD_MIN && share != null && share > NOT_FILTERING };
  });
  const totals = clean.filter((t) => ROWS.every((r) => t[r.key] != null)).map((t) => ROWS.reduce((s, r) => s + (t[r.key] as number), 0));
  const gated = v2.filter((t) => t.singular_gap != null || t.planned_rr != null);
  return {
    family: 'v2', grades, gradeN: clean.length, oneGrade: clean.length >= 8 && letters.length === 1 ? letters[0] : null, items,
    scores: { n: totals.length, distinct: new Set(totals).size, atOrAbove: totals.filter((x) => x >= 6).length, threshold: 6 },
    gates: { n: gated.length, manyGaps: v2.filter((t) => t.singular_gap === false).length, lowR: v2.filter((t) => { const r = plannedRNumber(t.planned_rr); return r != null && r < 1.5; }).length },
  };
}

/** Setup quality for one rubric family (legacy by default): its trades only, its own scale. */
export function setupQuality(trades: readonly Trade[], family: RubricFamily = 'legacy'): Quality {
  const fam = trades.filter((t) => rubricFamily(t) === family);
  const clean = fam.filter(gradedBlind); const exposed = fam.filter((t) => !gradedBlind(t));
  return {
    family, clean: gradeTable(clean, undefined, family), exposed: gradeTable(exposed, undefined, family),
    drift: [drift(fam, 'regrade'), drift(fam, 'blind')], cleanN: clean.length, exposedN: exposed.length, spread: spread(fam, family),
  };
}
