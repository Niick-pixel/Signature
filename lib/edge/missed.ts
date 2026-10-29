/**
 * Missed trades and hesitation (Edge Engine §5.12). Only missed setups logged
 * in real time count — hindsight entries are cherry-picked, so they are left
 * out and counted.
 *
 *  - skipped-would-have-won vs skipped-would-have-lost, and the R left on the
 *    table (the sum of positive would-be R)
 *  - by reason: fear, rule, distracted, missed it
 *  - skip quality: were your skips lower-scoring than your takes? The
 *    checklist scores of skips against takes (difference with an 80% range)
 *    and how often each would have won. If skips score the same as takes and
 *    win as often, hesitation is the leak; if lower, the filter is working.
 */
import { Z80 } from './dist';
import { resultClass, wilson } from './metrics';
import { isHypothetical } from '../domain';
import type { Trade } from '../types';

export interface MissedStats {
  realtime: number; hindsightLeftOut: number;
  wouldWin: number; wouldLose: number; unknown: number; rLeft: number;
  byReason: Array<{ reason: string; n: number; wouldWin: number; rLeft: number }>;
  skipScore: number | null; takeScore: number | null; scoreGap: number | null; scoreGapLo: number | null; scoreGapHi: number | null;
  skipWin: number | null; skipWinCI: { lo: number; hi: number } | null; takeWin: number | null;
  read: 'hesitation' | 'filter' | 'unclear' | 'too-few';
  ids: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const varOf = (xs: number[], m: number) => (xs.length > 1 ? xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1) : 0);
const wouldR = (t: Trade) => t.would_be_r ?? (t.would_have_hit_tp == null ? null : t.would_have_hit_tp ? 1 : -1);

/** `all`: every trade in view, missed and taken. */
export function missedStats(all: readonly Trade[]): MissedStats {
  const missed = all.filter((t) => isHypothetical(t.account) && !t.deleted_at);
  const rt = missed.filter((t) => t.written_before_outcome === true);
  const taken = all.filter((t) => !isHypothetical(t.account) && t.r_multiple != null && t.outcome !== 'Not taken');
  const wr = rt.map(wouldR);
  const win = wr.filter((v) => v != null && v > 0.1).length; const lose = wr.filter((v) => v != null && v < -0.1).length;
  const reasons = new Map<string, Trade[]>();
  for (const t of rt) { const k = t.skip_reason ?? 'Not given'; reasons.set(k, [...(reasons.get(k) ?? []), t]); }
  const ss = rt.map((t) => t.checklist_score).filter((v): v is number => v != null);
  const ts = taken.map((t) => t.checklist_score).filter((v): v is number => v != null);
  const sm = mean(ss); const tm = mean(ts);
  const gap = sm != null && tm != null ? sm - tm : null;
  const se = sm != null && tm != null && ss.length > 1 && ts.length > 1 ? Math.sqrt(varOf(ss, sm) / ss.length + varOf(ts, tm) / ts.length) : null;
  const skW = win + lose ? win / (win + lose) : null;
  const tW = taken.filter((t) => resultClass(t.r_multiple as number) === 'W').length; const tL = taken.filter((t) => resultClass(t.r_multiple as number) === 'L').length;
  const takeWin = tW + tL ? tW / (tW + tL) : null;
  let read: MissedStats['read'] = 'too-few';
  if (rt.length >= 8 && gap != null && se != null) {
    const lo = gap - Z80 * se; const hi = gap + Z80 * se;
    read = hi < -3 ? 'filter' : lo > -3 && skW != null && takeWin != null && skW >= takeWin - 0.05 ? 'hesitation' : 'unclear';
  }
  return {
    realtime: rt.length, hindsightLeftOut: missed.length - rt.length,
    wouldWin: win, wouldLose: lose, unknown: rt.length - win - lose, rLeft: wr.reduce((a: number, v) => a + (v != null && v > 0 ? v : 0), 0),
    byReason: [...reasons].map(([reason, ts2]) => ({ reason, n: ts2.length, wouldWin: ts2.filter((t) => (wouldR(t) ?? 0) > 0.1).length, rLeft: ts2.reduce((a, t) => a + Math.max(0, wouldR(t) ?? 0), 0) })).sort((a, b) => b.n - a.n),
    skipScore: sm, takeScore: tm, scoreGap: gap, scoreGapLo: gap != null && se != null ? gap - Z80 * se : null, scoreGapHi: gap != null && se != null ? gap + Z80 * se : null,
    skipWin: skW, skipWinCI: wilson(win, win + lose), takeWin, read, ids: rt.map((t) => t.id).reverse(),
  };
}
