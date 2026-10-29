/**
 * The state a trade was taken in — computed, never asked: which trade of the
 * day (or replay session) it was, how many losses in a row came before it,
 * the R already made or lost, minutes since the last loss, and whether it
 * came after a win or a loss. All of it is known before the entry, so it may
 * predict (lib/edge/fields registers it as pre).
 *
 * Also: hesitation — a missed setup logged in real time that scored at least
 * the threshold with the trigger fired was a trade the rules said to take.
 */
import { TAKE_IT_THRESHOLD, isBacktest, isHypothetical } from '../domain';
import { dayKey, isSessionKey, lossKnownAt, type DayContext } from '../ruleBook';
import { resultClass } from './metrics';
import type { Trade } from '../types';

export interface TradeState {
  key: string | null;
  /** 1 for the first trade of the day or session. */
  tradeNo: number | null;
  lossesInRowBefore: number | null;
  rBefore: number | null;
  minutesSinceLastLoss: number | null;
  after: 'first' | 'win' | 'loss' | 'be' | null;
  newsConflict: boolean | null;
}

const EMPTY: TradeState = { key: null, tradeNo: null, lossesInRowBefore: null, rBefore: null, minutesSinceLastLoss: null, after: null, newsConflict: null };
const order = (a: Trade, b: Trade) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at);

export function tradeStates(trades: readonly Trade[], ctxFor: (day: string) => DayContext = () => ({})): Map<string, TradeState> {
  const out = new Map<string, TradeState>();
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = dayKey(t);
    if (k == null) { out.set(t.id, EMPTY); continue; }
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  for (const [k, list] of groups) {
    const ts = [...list].sort(order);
    const session = isSessionKey(k);
    const ctx = session ? {} : ctxFor(k);
    let run = 0; let r = 0; let lastLossAt: string | null = null;
    ts.forEach((t, i) => {
      const prev = ts[i - 1];
      out.set(t.id, {
        key: k, tradeNo: i + 1, lossesInRowBefore: run, rBefore: Math.round(r * 100) / 100,
        // A replay's times are when it was logged, not market time.
        minutesSinceLastLoss: !session && lastLossAt ? Math.round((Date.parse(t.date) - Date.parse(lastLossAt)) / 60_000) : null,
        after: !prev ? 'first' : prev.r_multiple == null ? null : ({ W: 'win', L: 'loss', BE: 'be' } as const)[resultClass(prev.r_multiple)],
        newsConflict: session ? null : Boolean(ctx.redFolder || ctx.nfpGuess),
      });
      const c = t.r_multiple == null ? null : resultClass(t.r_multiple);
      run = c === 'L' ? run + 1 : c == null ? run : 0;
      r += t.r_multiple ?? 0;
      if (c === 'L') lastLossAt = lossKnownAt(t);
    });
  }
  return out;
}

/** A trade with its state attached, for the engine's derived fields. */
export type StatefulTrade = Trade & { __state?: TradeState };
export function withState(trades: readonly Trade[], states: Map<string, TradeState>): StatefulTrade[] {
  return trades.map((t) => ({ ...t, __state: states.get(t.id) ?? EMPTY }));
}

export interface Hesitation { id: string; date: string; account: string; score: number; wouldBeR: number | null; hitTp: boolean | null; reason: string | null }

/**
 * Real-time missed setups the rules said to take (score ≥ threshold, trigger
 * fired) — hesitation counts as a rule break. Hindsight entries are left out
 * (they are cherry-picked) and only counted.
 */
export function hesitations(trades: readonly Trade[]): { breaks: Hesitation[]; hindsightLeftOut: number } {
  const missed = trades.filter((t) => isHypothetical(t.account) && !t.deleted_at && !isBacktest(t.account));
  const realtime = missed.filter((t) => t.written_before_outcome === true);
  return {
    breaks: realtime.filter((t) => t.checklist_score >= TAKE_IT_THRESHOLD && t.trigger_fired).map((t) => ({
      id: t.id, date: t.date, account: t.account, score: t.checklist_score, wouldBeR: t.would_be_r ?? t.r_multiple, hitTp: t.would_have_hit_tp, reason: t.skip_reason,
    })),
    hindsightLeftOut: missed.length - realtime.length,
  };
}
