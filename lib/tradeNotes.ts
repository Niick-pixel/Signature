/**
 * Short notes for the trade form, read from your own journal and shown one at
 * a time (components/capture/TradeNotes): your last lessons, the mistake you
 * tag most, what you do best, and what trades at this grade did. Pure.
 *
 * Context only (product rule 6: no signals): every note is about what you
 * wrote or did, never "take this one". A note with too few trades behind it
 * says so instead of showing a number.
 */
import { isBacktest, isHypothetical, isTaken, type Outcome } from './domain';
import { rubricFamily } from './decision';

export interface TradeNote { id: string; title: string; body: string; tone?: 'win' | 'loss' | 'watch' }

type T = {
  id: string; account: string; date: string; created_at: string; deleted_at?: string | null; outcome: string; status?: string;
  r_multiple: number | null; lesson?: string | null; mistake_tags?: readonly string[] | null; worked_tags?: readonly string[] | null;
  rubric_version?: number | null; grade_letter?: string | null;
};

/** A grade's numbers are shown from this many trades. */
export const GRADE_NOTE_MIN = 5;
const RECENT = 20;

/**
 * `world`: backtests read backtests, real accounts read real accounts (missed setups never).
 * `exclude`: the trade being written. `grade`: its locked Rubric v2 grade, if any.
 */
export function tradeNotes(all: readonly T[], o: { world: 'backtest' | 'real'; exclude?: string | null; grade?: string | null }): TradeNote[] {
  const mine = all.filter((t) => !t.deleted_at && t.id !== o.exclude && !isHypothetical(t.account)
    && (o.world === 'backtest' ? isBacktest(t.account) : !isBacktest(t.account)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const taken = mine.filter((t) => isTaken(t.outcome as Outcome) && t.status !== 'Planned' && t.r_multiple != null);
  const out: TradeNote[] = [];

  // The same lesson written twice is shown once.
  const lessons = [...new Set(mine.map((t) => (t.lesson ?? '').trim()).filter((l) => l.length > 0))].slice(0, 3);
  for (const [i, l] of lessons.entries()) {
    out.push({ id: `lesson-${i}`, title: i === 0 ? 'Your last lesson' : 'An earlier lesson', body: l.length > 220 ? `${l.slice(0, 217)}…` : l });
  }

  const recent = taken.slice(0, RECENT);
  const top = (pick: (t: T) => readonly string[] | null | undefined) => {
    const n = new Map<string, number>();
    for (const t of recent) for (const x of pick(t) ?? []) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
  };
  const mistake = top((t) => t.mistake_tags);
  if (mistake && mistake[1] >= 2) {
    out.push({ id: 'mistake', title: 'Your most tagged mistake', body: `“${mistake[0]}” — on ${mistake[1]} of your last ${recent.length} trades.`, tone: 'loss' });
  }
  const worked = top((t) => t.worked_tags);
  if (worked && worked[1] >= 2) {
    out.push({ id: 'worked', title: 'What you do best', body: `“${worked[0]}” — on ${worked[1]} of your last ${recent.length} trades.`, tone: 'win' });
  }

  if (o.grade) {
    // Rubric v2 grades only: an old checklist A is a different grade.
    const same = taken.filter((t) => rubricFamily(t) === 'v2' && t.grade_letter === o.grade);
    const label = o.grade === 'F' ? 'No trade' : o.grade;
    if (same.length < GRADE_NOTE_MIN) {
      out.push({ id: 'grade', title: `Graded ${label} before`, body: `${same.length} ${o.world === 'backtest' ? 'backtest' : 'real'} trade${same.length === 1 ? '' : 's'} at this grade so far — numbers from ${GRADE_NOTE_MIN}.` });
    } else {
      const rs = same.map((t) => t.r_multiple as number);
      const wins = rs.filter((r) => r > 0.1).length; const losses = rs.filter((r) => r < -0.1).length;
      const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
      out.push({ id: 'grade', title: `Graded ${label} before`, tone: avg >= 0 ? 'win' : 'loss',
        body: `${same.length} trades · ${wins}W ${losses}L · ${avg >= 0 ? '+' : '−'}${Math.abs(avg).toFixed(2)}R a trade. Context, not a verdict on this one.` });
    }
  }
  return out;
}

/**
 * Step 2's honesty card, from your last 50 trades in this world: graded before the outcome (the Discipline
 * score's Honesty axis), re-graded lower than the grade at entry, and decided within the clock (timed Rubric v2
 * trades). Each with the count behind it; null where there is nothing to count yet.
 */
export interface HonestyStats {
  graded: { pct: number | null; n: number };
  regradedLower: { lower: number; of: number };
  inTime: { pct: number | null; n: number };
}
export const HONESTY_WINDOW = 50;
const RANK: Record<string, number> = { 'A+': 9, A: 8, 'A-': 7, 'B+': 6, B: 5, 'B-': 4, C: 3, D: 2, F: 1 };
export function honestyStats(all: readonly (T & { graded_post_hoc?: boolean | null; regrade?: string | null; decision_seconds?: number | null; decision_limit?: number | null })[],
  world: 'backtest' | 'real', exclude?: string | null): HonestyStats {
  const ts = all.filter((t) => !t.deleted_at && t.id !== exclude && !isHypothetical(t.account) && isTaken(t.outcome as Outcome) && t.status !== 'Planned'
    && (world === 'backtest' ? isBacktest(t.account) : !isBacktest(t.account)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, HONESTY_WINDOW);
  const pre = ts.filter((t) => !t.graded_post_hoc).length;
  const re = ts.filter((t) => t.regrade && t.grade_letter && RANK[t.regrade] != null && RANK[t.grade_letter] != null);
  const timed = ts.filter((t) => t.decision_limit != null && t.decision_seconds != null);
  const kept = timed.filter((t) => (t.decision_seconds as number) <= (t.decision_limit as number)).length;
  return {
    graded: { pct: ts.length ? Math.round((pre / ts.length) * 100) : null, n: ts.length },
    regradedLower: { lower: re.filter((t) => RANK[t.regrade as string] < RANK[t.grade_letter as string]).length, of: re.length },
    inTime: { pct: timed.length ? Math.round((kept / timed.length) * 100) : null, n: timed.length },
  };
}
