/**
 * Monte Carlo on your own results (Edge Engine §5.10).
 *
 * A block bootstrap: each simulated future is stitched from runs of 4
 * consecutive trades drawn from your history (wrapping round the end), so
 * losing streaks keep the shape they really have instead of being shuffled
 * apart. 10,000 paths, seeded from the data — the same journal always gives
 * the same cone.
 *
 *  - the equity cone: the 5/25/50/75/95th percentile of cumulative R after
 *    each trade, drawn behind the real curve
 *  - the distribution of the worst drawdown and the longest losing streak,
 *    and where yours sits in it
 *  - the eval simulator: R → $ at a risk per trade, the profit target, a
 *    static / end-of-day trailing / intraday trailing drawdown, the daily
 *    loss limit and the minimum days → P(pass), P(bust), median days to pass
 */
import { mulberry32, seedOf } from './rng';
import { resultClass } from './metrics';

export const PATHS = 10_000; export const BLOCK = 4; export const MIN_MC = 10;
export interface Dist { p05: number; p25: number; p50: number; p75: number; p95: number; mean: number }
export interface Cone { p05: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[]; paths: number; block: number; maxDD: Dist; streak: Dist; ddPercentile: number; streakPercentile: number }

const q = (sorted: ArrayLike<number>, p: number) => {
  const n = sorted.length; if (!n) return 0;
  const i = Math.min(n - 1, Math.max(0, (n - 1) * p)); const lo = Math.floor(i); const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
export const dist = (xs: Float64Array | number[]): Dist => {
  const s = Float64Array.from(xs).sort();
  return { p05: q(s, 0.05), p25: q(s, 0.25), p50: q(s, 0.5), p75: q(s, 0.75), p95: q(s, 0.95), mean: s.reduce((a, b) => a + b, 0) / (s.length || 1) };
};

/** A stream of R values stitched from blocks of consecutive trades. */
export function blockStream(rs: readonly number[], rand: () => number, block = BLOCK): () => number {
  const n = rs.length; let pos = 0; let left = 0;
  return () => {
    if (left === 0) { pos = Math.floor(rand() * n); left = Math.min(block, n); }
    const v = rs[pos % n]; pos += 1; left -= 1; return v;
  };
}

function longestLosing(rs: ArrayLike<number>): number {
  let s = 0; let best = 0;
  for (let i = 0; i < rs.length; i++) { const c = resultClass(rs[i]); if (c === 'L') { s += 1; if (s > best) best = s; } else if (c === 'W') s = 0; }
  return best;
}
function maxDrawdown(rs: ArrayLike<number>): number {
  let c = 0; let peak = 0; let dd = 0;
  for (let i = 0; i < rs.length; i++) { c += rs[i]; if (c > peak) peak = c; if (c - peak < dd) dd = c - peak; }
  return dd;
}

/** The cone over the same number of trades as your history (or `horizon`). */
export function equityCone(rs: readonly number[], opts: { paths?: number; block?: number; horizon?: number } = {}): Cone | null {
  const n = rs.length; if (n < MIN_MC) return null;
  const paths = opts.paths ?? PATHS; const block = opts.block ?? BLOCK; const H = opts.horizon ?? n;
  // Percentiles at up to 160 steps, interpolated between — the chart is never wider than that.
  const steps = H <= 160 ? Array.from({ length: H }, (_, i) => i) : Array.from({ length: 160 }, (_, i) => Math.round((i * (H - 1)) / 159));
  const stepIdx = new Int32Array(H).fill(-1); steps.forEach((s, j) => { stepIdx[s] = j; });
  const cols = steps.map(() => new Float64Array(paths));
  const dds = new Float64Array(paths); const streaks = new Float64Array(paths);
  const rand = mulberry32(seedOf(rs, 'cone'));
  const path = new Float64Array(H);
  for (let p = 0; p < paths; p++) {
    const next = blockStream(rs, rand, block);
    let c = 0;
    for (let i = 0; i < H; i++) { const r = next(); path[i] = r; c += r; const j = stepIdx[i]; if (j >= 0) cols[j][p] = c; }
    dds[p] = maxDrawdown(path); streaks[p] = longestLosing(path);
  }
  const pct = cols.map((c) => { c.sort(); return [q(c, 0.05), q(c, 0.25), q(c, 0.5), q(c, 0.75), q(c, 0.95)]; });
  const at = (k: number) => {
    if (steps.length === H) return pct.map((x) => x[k]);
    return Array.from({ length: H }, (_, i) => {
      const j = steps.findIndex((s) => s >= i); if (steps[j] === i) return pct[j][k];
      const a = steps[j - 1]; const b = steps[j]; const t = (i - a) / (b - a); return pct[j - 1][k] + (pct[j][k] - pct[j - 1][k]) * t;
    });
  };
  const actualDD = maxDrawdown(rs); const actualStreak = longestLosing(rs);
  return {
    p05: at(0), p25: at(1), p50: at(2), p75: at(3), p95: at(4), paths, block,
    maxDD: dist(dds), streak: dist(streaks),
    // Share of futures with a drawdown as deep as yours or deeper; a losing run as long or longer.
    ddPercentile: dds.filter((d) => d <= actualDD + 1e-9).length / paths,
    streakPercentile: streaks.filter((s) => s >= actualStreak).length / paths,
  };
}

/* ───────────── the eval simulator ───────────── */

export type DrawdownKind = 'static' | 'eod_trailing' | 'intraday_trailing';
export interface EvalRules {
  start: number; target: number; maxDrawdown: number; drawdown: DrawdownKind;
  /** Trailing drawdown stops rising once its floor reaches start + this (null: never). */
  trailLock: number | null;
  dailyLoss: number | null; minDays: number | null;
  /** Dollars risked per trade (1R). */
  risk: number;
}
export interface EvalResult { paths: number; pPass: number; pBust: number; pOpen: number; medianDays: number | null; medianTrades: number | null; bustBy: { drawdown: number; daily: number }; maxDays: number }

/**
 * Trades per day are drawn from how many you really took per day
 * (`tradesPerDay`), so a two-trade habit is simulated as one. A daily-loss
 * breach counts as a bust (most evals fail you for it). Consistency rules are
 * not simulated.
 */
export function evalSim(rs: readonly number[], rules: EvalRules, opts: { paths?: number; block?: number; tradesPerDay?: readonly number[]; maxDays?: number; salt?: string } = {}): EvalResult | null {
  if (rs.length < MIN_MC || rules.risk <= 0) return null;
  const paths = opts.paths ?? PATHS; const maxDays = opts.maxDays ?? 60;
  const perDay = opts.tradesPerDay?.length ? opts.tradesPerDay : [1];
  const rand = mulberry32(seedOf(rs, `eval|${JSON.stringify(rules)}|${perDay.join(',')}|${opts.salt ?? ''}`));
  let pass = 0; let bust = 0; let bustDD = 0; let bustDaily = 0;
  const daysToPass: number[] = []; const tradesToPass: number[] = [];
  const cap = rules.trailLock != null ? rules.start + rules.trailLock : Infinity;
  for (let p = 0; p < paths; p++) {
    const next = blockStream(rs, rand, opts.block ?? BLOCK);
    let bal = rules.start; let floor = Math.min(cap, rules.start - rules.maxDrawdown); let peak = rules.start; let trades = 0; let done = false;
    for (let d = 1; d <= maxDays && !done; d++) {
      const k = perDay[Math.floor(rand() * perDay.length)];
      const open = bal;
      for (let i = 0; i < k; i++) {
        bal += next() * rules.risk; trades += 1;
        if (rules.drawdown === 'intraday_trailing' && bal > peak) { peak = bal; floor = Math.min(cap, Math.max(floor, peak - rules.maxDrawdown)); }
        if (bal <= floor) { bust += 1; bustDD += 1; done = true; break; }
        if (rules.dailyLoss != null && open - bal >= rules.dailyLoss) { bust += 1; bustDaily += 1; done = true; break; }
      }
      if (done) break;
      if (rules.drawdown === 'eod_trailing' && bal > peak) { peak = bal; floor = Math.min(cap, Math.max(floor, peak - rules.maxDrawdown)); }
      if (bal >= rules.start + rules.target && d >= (rules.minDays ?? 0)) { pass += 1; daysToPass.push(d); tradesToPass.push(trades); done = true; }
    }
  }
  const med = (xs: number[]) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  return { paths, pPass: pass / paths, pBust: bust / paths, pOpen: (paths - pass - bust) / paths, medianDays: med(daysToPass), medianTrades: med(tradesToPass), bustBy: { drawdown: bustDD / paths, daily: bustDaily / paths }, maxDays };
}
