/**
 * Small summaries the dashboard's widgets draw that the engine did not
 * already produce. Statistics live here, in lib/edge, tested — never in a
 * widget.
 *
 * - rollingExpectancy: the mean R of the last `window` trades, at each trade
 * - gradeShift: grades given at entry against the re-grade (or the blind grade), letter by letter
 * - exitReasons: how trades ended. Descriptive only: an exit reason is known
 *   after the outcome, so it carries no verdict (TP "beating" SL is not a finding)
 * - backtestGap: the same setup level, live against replay (moved here from the Stats page)
 */
import type { Trade } from '../types';
import type { ExplorerRow } from './explorer';
import { EXIT_REASONS } from '../anatomy';

export interface RollingPoint { i: number; mean: number; lo80: number; hi80: number; n: number }

/**
 * The mean of the trailing `window` trades at each trade from the window-th
 * on, with a rough 80% band (mean ± 1.28·sd/√n). Fewer trades than the window:
 * no points (the widget shows its too-early state).
 */
export function rollingExpectancy(rs: readonly number[], window = 20): RollingPoint[] {
  const out: RollingPoint[] = [];
  if (window < 2) return out;
  for (let i = window - 1; i < rs.length; i++) {
    const w = rs.slice(i - window + 1, i + 1);
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / (w.length - 1));
    const half = 1.2816 * sd / Math.sqrt(w.length);
    out.push({ i, mean, lo80: mean - half, hi80: mean + half, n: w.length });
  }
  return out;
}

export const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D', 'F'] as const;
export interface GradeShift { against: 'regrade' | 'blind'; n: number; before: Record<string, number>; after: Record<string, number>; down: number; same: number; up: number }

/** Grades at entry against the later grade, on the trades that have both. */
export function gradeShift(trades: readonly Trade[], against: 'regrade' | 'blind' = 'regrade'): GradeShift {
  const rank = (g: string | null | undefined) => (g ? GRADE_ORDER.indexOf(g as typeof GRADE_ORDER[number]) : -1);
  const pairs = trades.map((t) => [t.grade_letter, against === 'regrade' ? t.regrade : t.blind_grade] as const)
    .filter(([a, b]) => rank(a) >= 0 && rank(b) >= 0) as Array<readonly [string, string]>;
  const before: Record<string, number> = {}; const after: Record<string, number> = {};
  let down = 0; let same = 0; let up = 0;
  for (const [a, b] of pairs) {
    before[a] = (before[a] ?? 0) + 1; after[b] = (after[b] ?? 0) + 1;
    // A lower rank index is a better grade.
    if (rank(b) > rank(a)) down++; else if (rank(b) < rank(a)) up++; else same++;
  }
  return { against, n: pairs.length, before, after, down, same, up };
}

export interface ExitRow { reason: string; n: number; share: number; meanR: number | null; totalR: number }

/** How settled trades ended, most common first; trades without an exit reason are counted apart. */
export function exitReasons(trades: readonly Trade[]): { rows: ExitRow[]; unknown: number; n: number } {
  const settled = trades.filter((t) => t.r_multiple != null && t.outcome !== 'Not taken');
  const known = settled.filter((t) => t.exit_reason && (EXIT_REASONS as readonly string[]).includes(t.exit_reason));
  const rows = (EXIT_REASONS as readonly string[]).map((reason) => {
    const xs = known.filter((t) => t.exit_reason === reason).map((t) => t.r_multiple as number);
    const totalR = xs.reduce((a, b) => a + b, 0);
    return { reason, n: xs.length, share: known.length ? xs.length / known.length : 0, meanR: xs.length ? totalR / xs.length : null, totalR };
  }).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  return { rows, unknown: settled.length - known.length, n: settled.length };
}

export interface GapRow { label: string; live: number; liveN: number; bt: number; btN: number; gap: number }

/** The same setup level live and in replay: a big gap means execution, not the setup. Biggest gaps first. */
export function backtestGap(live: readonly ExplorerRow[], replay: readonly ExplorerRow[], max = 8): GapRow[] {
  return live.filter((r) => !r.hidden).flatMap((r) => {
    const b = replay.find((x) => x.field === r.field && x.level === r.level && !x.hidden);
    return b ? [{ label: `${r.label} = ${r.level}`, live: r.shrunk, liveN: r.n, bt: b.shrunk, btN: b.n, gap: r.shrunk - b.shrunk }] : [];
  }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, max);
}

/** How far below its own high the equity curve is after each trade (0 at a new high, negative under water), in R. */
export function underwater(cumulative: readonly number[]): number[] {
  let peak = 0;
  return cumulative.map((c) => { peak = Math.max(peak, c); return c - peak; });
}
