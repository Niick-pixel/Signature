/**
 * The plan, graded against the day (feature 6). Pure. The morning says what
 * the day should look like — prepared, which side, how many trades, when to
 * stop — and the trades say what it did. Each part that applies is checked;
 * the grade is the share kept. A day with no trades and a plan that said
 * "no trade today" keeps everything: sitting out is a plan followed.
 */
import { prepProgress, type PrepData } from './prep';
import { planMatch } from './planMatch';
import { afterLossStop } from './ruleBook';
import type { DailyReview, Trade } from './types';

export interface GradePart { id: 'prepared' | 'in_plan' | 'side' | 'count' | 'stop'; label: string; kept: boolean | null; detail: string }
export interface DayGrade { day: string; score: number | null; letter: 'A' | 'B' | 'C' | 'D' | 'F' | null; parts: GradePart[]; trades: number }

const letterOf = (s: number): DayGrade['letter'] => (s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : s >= 45 ? 'D' : 'F');

/**
 * `open`: the day is still running (today). Until a trade is taken, a prep not
 * yet finished is "not yet", not a miss — no F at seven in the morning. A
 * closed day with no live trades and no prep has nothing to grade (a weekend
 * of replays, a day off).
 */
export function dayGrade(day: string, trades: readonly Trade[], prep: PrepData | null, review: Pick<DailyReview, 'trades_planned'> | null, stopAfter: number, open = false): DayGrade {
  const ts = trades.filter((t) => !t.deleted_at && !t.undated && t.status !== 'Planned' && t.account !== 'Missed' && !t.account.startsWith('Backtest')
    && t.date.startsWith(day)).sort((a, b) => a.date.localeCompare(b.date));
  const parts: GradePart[] = [];

  if (!ts.length && !prep && !open) return { day, score: null, letter: null, parts: [], trades: 0 };
  const progress = prep ? prepProgress(prep) : null;
  const prepared = progress ? progress.done >= Math.min(4, progress.total) : false;
  parts.push({
    id: 'prepared', label: 'Prepared before the session',
    kept: prepared ? true : open && !ts.length ? null : false,
    detail: progress ? `${progress.done} of ${progress.total} prep steps${!prepared && open && !ts.length ? ' so far' : ''}` : open && !ts.length ? 'Not yet' : 'No chart prep',
  });

  const side = prep?.answers?.['draw.side'];
  if (typeof side === 'string' && side !== 'Both ways') {
    const wrong = ts.filter((t) => side === 'No trade today' || (side === 'Longs only' ? t.direction !== 'Long' : t.direction !== 'Short'));
    parts.push({ id: 'side', label: side === 'No trade today' ? 'Sat out, as planned' : `${side}, as planned`, kept: wrong.length === 0,
      detail: wrong.length ? `${wrong.length} trade${wrong.length === 1 ? '' : 's'} the other way` : ts.length ? 'Every trade on the planned side' : 'No trades' });
  }

  if (ts.length && prep) {
    const off = ts.filter((t) => planMatch(t, prep).status === 'off');
    parts.push({ id: 'in_plan', label: 'Trades inside the plan', kept: off.length === 0, detail: off.length ? `${off.length} of ${ts.length} off plan` : `All ${ts.length} in the plan` });
  }

  if (review?.trades_planned != null && review.trades_planned > 0) {
    parts.push({ id: 'count', label: `At most ${review.trades_planned} trade${review.trades_planned === 1 ? '' : 's'}`, kept: ts.length <= review.trades_planned,
      detail: `${ts.length} taken` });
  }

  if (ts.length) {
    const after = afterLossStop(ts, stopAfter).length;
    const losses = ts.filter((t) => t.outcome === 'Loss').length;
    parts.push({ id: 'stop', label: `Stopped after ${stopAfter} loss${stopAfter === 1 ? '' : 'es'} in a row`, kept: after === 0,
      detail: after ? `${after} trade${after === 1 ? '' : 's'} after the stop` : `${losses} loss${losses === 1 ? '' : 'es'}` });
  }

  const judged = parts.filter((p) => p.kept != null);
  const score = judged.length ? Math.round((judged.filter((p) => p.kept).length / judged.length) * 100) : null;
  return { day, score, letter: score == null ? null : letterOf(score), parts, trades: ts.length };
}
