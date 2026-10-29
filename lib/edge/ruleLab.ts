/**
 * The Rule Lab (Edge Engine §5.9): what would have happened under a stricter
 * rule — a counterfactual on your own trades, never a recommendation.
 *
 * Each filter keeps or removes every trade. A trade it can't judge (the field
 * was never recorded) is kept, and counted, so a filter never wins by
 * dropping the trades you didn't describe. For any set of filters (all must
 * pass):
 *
 *  - trades kept and removed, expectancy with its bootstrap interval, net R,
 *    max drawdown, trades per week (dated trades) or per session (replays)
 *  - Δ expectancy against everything you took, and P(improvement) from a
 *    paired bootstrap: resample your trades 2,000 times (seeded) and count
 *    how often the kept trades' mean beats the whole set's
 *  - walk-forward: with 60 trades or more, the same Δ on the later half only —
 *    the half the idea was not "seen" on
 *  - the experiment size: trades needed to tell that Δ apart (power helper)
 *
 * Every result is labelled an experiment — test it on the next N trades.
 */
import { edgeMetrics, type EdgeMetrics } from './metrics';
import { mulberry32, seedOf } from './rng';
import { nPerGroup } from './power';
import type { TradeState } from './state';
import { closureScore } from '../anatomy';
import type { Trade } from '../types';

type Break = { id: string };
export interface LabFilter { id: string; label: string; help: string; test: (t: Trade, s: TradeState | undefined, ctx: { breaks: Break[]; sinceFirstLoss: number | null }) => boolean | null }

const st = (t: Trade) => (t as Trade & { __state?: TradeState }).__state;

export const LAB_FILTERS: LabFilter[] = [
  { id: 'rules-only', label: 'Only trades inside every rule', help: 'Nothing broken — auto or self. The rule-followed-only curve.', test: (_t, _s, c) => c.breaks.length === 0 },
  { id: 'with-bias', label: 'Only with the HTF bias', help: 'Removes trades marked against the bias.', test: (t) => (t.htf_bias === 'Against bias' ? false : t.htf_bias === 'With bias' ? true : null) },
  { id: 'liq-event', label: 'Only with a liquidity event', help: 'Removes trades whose liquidity event is None.', test: (t) => (t.liquidity_event == null ? null : t.liquidity_event !== 'None') },
  { id: 'no-anticipation', label: 'No anticipation entries', help: 'Removes entries taken before the inversion closed.', test: (t) => (t.entry_method == null ? null : t.entry_method !== 'Before close (anticipation)') },
  { id: 'no-diagonal', label: 'No trendline targets', help: 'Removes trades targeting a diagonal / LRLR trendline.', test: (t) => (t.target_type == null ? null : !/trend|diagonal|lrlr/i.test(t.target_type)) },
  { id: 'closure-8', label: 'Closure score 8 or more', help: 'Keeps inversion closures graded A− or better.', test: (t) => { const c = closureScore(t); return c == null ? null : c >= 8; } },
  { id: 'killzone', label: 'Inside the killzone only', help: 'Removes trades marked outside the killzone.', test: (t) => (t.chk_killzone == null ? null : Boolean(t.chk_killzone)) },
  { id: 'a-grade', label: 'A and A+ only', help: 'Keeps A+ and A grades.', test: (t) => (t.grade_letter ? t.grade_letter === 'A+' || t.grade_letter === 'A' : null) },
  { id: 'max-2', label: 'At most 2 trades a day', help: 'Removes the 3rd trade of a day or session and later.', test: (_t, s) => (s?.tradeNo == null ? null : s.tradeNo <= 2) },
  { id: 'stop-first-loss', label: 'Stop after the first loss of the day', help: 'Removes every trade after a loss that day.', test: (_t, _s, c) => (c.sinceFirstLoss == null ? true : false) },
  { id: 'one-after-loss', label: 'At most 1 trade after a loss', help: 'After the first loss of a day, one more trade, then done.', test: (_t, _s, c) => (c.sinceFirstLoss == null ? true : c.sinceFirstLoss <= 1) },
];

export interface LabRow { id: string; r: number; day: string | null; session: string | null; keep: Record<string, boolean>; unknown: Record<string, boolean> }

/** `trades`: settled, with state attached (lib/edge/state withState), oldest first. */
export function labRows(trades: readonly Trade[], breaks: (t: Trade) => Break[]): LabRow[] {
  // Trades since the first loss of the same day / session, in order.
  const since = new Map<string, number | null>();
  const byKey = new Map<string, Trade[]>();
  for (const t of trades) { const k = st(t)?.key; if (k) byKey.set(k, [...(byKey.get(k) ?? []), t]); }
  for (const ts of byKey.values()) {
    const sorted = [...ts].sort((a, b) => (st(a)?.tradeNo ?? 0) - (st(b)?.tradeNo ?? 0));
    let after: number | null = null;
    for (const t of sorted) { since.set(t.id, after); if (after != null) after += 1; else if ((t.r_multiple ?? 0) < -0.1) after = 1; }
  }
  return trades.map((t) => {
    const s = st(t); const ctx = { breaks: breaks(t), sinceFirstLoss: since.get(t.id) ?? null };
    const keep: Record<string, boolean> = {}; const unknown: Record<string, boolean> = {};
    for (const f of LAB_FILTERS) { const v = f.test(t, s, ctx); keep[f.id] = v !== false; unknown[f.id] = v == null; }
    const key = s?.key ?? null;
    return { id: t.id, r: t.r_multiple as number, day: key && !key.startsWith('session:') ? key : null, session: key?.startsWith('session:') ? key : null, keep, unknown };
  });
}

export interface LabResult {
  filters: string[]; kept: number; removed: number; unknownKept: number;
  metrics: EdgeMetrics; baseExpectancy: number | null;
  delta: number | null; pImprove: number | null;
  laterHalf: { delta: number; pImprove: number; n: number } | null;
  perWeek: number | null; perSession: number | null;
  testN: number | null;
  /** Cumulative R of the kept trades at every trade you took — flat where a trade was removed, so the two curves line up. */
  curve: number[];
}

const B = 2000;
const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function pairedP(rs: number[], keep: boolean[], salt: string): number {
  const n = rs.length; const rand = mulberry32(seedOf(rs, `lab|${salt}`));
  let wins = 0; let valid = 0;
  for (let b = 0; b < B; b++) {
    let sa = 0; let sk = 0; let nk = 0;
    for (let i = 0; i < n; i++) { const j = Math.floor(rand() * n); sa += rs[j]; if (keep[j]) { sk += rs[j]; nk += 1; } }
    if (!nk) continue; valid += 1;
    if (sk / nk > sa / n) wins += 1;
  }
  return valid ? wins / valid : 0.5;
}

export function labResult(rows: readonly LabRow[], filters: readonly string[], opts: { resamples?: number } = {}): LabResult {
  const keep = rows.map((r) => filters.every((f) => r.keep[f] !== false));
  const rs = rows.map((r) => r.r);
  const keptRs = rs.filter((_, i) => keep[i]);
  const metrics = edgeMetrics(keptRs.map((r) => ({ r })), { resamples: opts.resamples });
  const base = rs.length ? meanOf(rs) : null;
  const delta = keptRs.length && base != null ? meanOf(keptRs) - base : null;
  const salt = filters.join(',');
  const pImprove = keptRs.length && keptRs.length < rs.length ? pairedP(rs, keep, salt) : null;
  let laterHalf: LabResult['laterHalf'] = null;
  if (rs.length >= 60) {
    const h = Math.floor(rs.length / 2); const lr = rs.slice(h); const lk = keep.slice(h);
    const lkr = lr.filter((_, i) => lk[i]);
    if (lkr.length && lkr.length < lr.length) laterHalf = { delta: meanOf(lkr) - meanOf(lr), pImprove: pairedP(lr, lk, `${salt}|later`), n: lkr.length };
  }
  const days = rows.filter((r, i) => keep[i] && r.day).map((r) => r.day as string).sort();
  const weeks = days.length ? Math.max(1, (Date.parse(`${days[days.length - 1]}T12:00:00Z`) - Date.parse(`${days[0]}T12:00:00Z`)) / (7 * 86_400_000)) : null;
  const sessions = new Set(rows.filter((r, i) => keep[i] && r.session).map((r) => r.session));
  let c = 0;
  // The spread for the experiment size: the kept trades', or everything's when they don't vary.
  const sdAll = rs.length > 1 ? Math.sqrt(rs.reduce((a, r) => a + (r - (base ?? 0)) ** 2, 0) / (rs.length - 1)) : null;
  const sd = metrics.sd || sdAll;
  return {
    filters: [...filters], kept: keptRs.length, removed: rs.length - keptRs.length,
    unknownKept: rows.filter((r, i) => keep[i] && filters.some((f) => r.unknown[f])).length,
    metrics, baseExpectancy: base, delta, pImprove, laterHalf,
    perWeek: weeks ? days.length / weeks : null, perSession: sessions.size ? rows.filter((r, i) => keep[i] && r.session).length / sessions.size : null,
    testN: delta != null && sd ? Math.min(999, Math.max(10, nPerGroup(sd, Math.max(0.1, Math.abs(delta))))) : null,
    curve: rs.map((r, i) => (c += keep[i] ? r : 0)),
  };
}

/** Trades per day you really took (real days) — the eval simulator draws from it. */
export function tradesPerDay(rows: readonly LabRow[], keep?: readonly boolean[]): number[] {
  const m = new Map<string, number>();
  rows.forEach((r, i) => { if ((keep ? keep[i] : true) && (r.day || r.session)) { const k = (r.day ?? r.session)!; m.set(k, (m.get(k) ?? 0) + 1); } });
  return [...m.values()];
}
