/**
 * The canonical trade metrics: the one place a win, a loss, an average or an
 * adherence rate is defined. Every page reads these; nothing recomputes them.
 *
 *  - A trade's result class comes from its R, not its label: R above +0.10 is
 *    a win, below −0.10 a loss, anything between a breakeven (BE_THRESHOLD).
 *  - Win rate = W / (W + L); breakevens are counted, never in the rate.
 *  - Avg win = mean R of wins only; avg loss = mean R of losses only.
 *  - Expectancy = mean R over every trade, breakevens included.
 *  - Profit factor = Σ positive R / |Σ negative R| (small BE amounts in their own sums).
 *  - Breakeven win rate = |avg loss| / (avg win + |avg loss|).
 *  - Rule adherence = trades with no rule broken / trades.
 */
import { bootstrapMean, type MeanInterval } from './bootstrap';

export const BE_THRESHOLD = 0.10;
export type ResultClass = 'W' | 'L' | 'BE';

export function resultClass(r: number, threshold = BE_THRESHOLD): ResultClass {
  return r > threshold ? 'W' : r < -threshold ? 'L' : 'BE';
}

/** One trade as the metrics see it, in time order. */
export interface MetricRow { r: number; money?: number | null }

export interface Interval { lo: number; hi: number }

export interface EdgeMetrics {
  n: number; wins: number; losses: number; be: number;
  winRate: number | null;
  /** Wilson 95% interval for the win rate. */
  winRateCI: Interval | null;
  avgWin: number | null; avgLoss: number | null;
  expectancy: number | null;
  /** Bootstrap of the expectancy (5,000 resamples, seeded from the data). */
  expectancyCI: MeanInterval | null;
  profitFactor: number | null;
  breakevenWinRate: number | null;
  grossWin: number; grossLoss: number; netR: number;
  netMoney: number | null; pricedN: number;
  sd: number | null;
  maxDrawdownR: number;
  longestLosingStreak: number;
  /** Trades it took to climb out of the deepest drawdown; null while still under water (or no drawdown). */
  recoveryTrades: number | null;
  stillUnderwater: boolean;
  /** Trades in total at which P(edge > 0) would reach 95% if today's expectancy and spread hold; null if expectancy ≤ 0. */
  tradesFor95: number | null;
}

/** Wilson score interval for k successes in n (z = 1.96 for 95%). */
export function wilson(k: number, n: number, z = 1.96): Interval | null {
  if (n <= 0) return null;
  const p = k / n; const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Cumulative R after each trade. Its last point is always the net R. */
export function equity(rows: readonly MetricRow[]): number[] {
  let c = 0;
  return rows.map((x) => (c += x.r));
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function edgeMetrics(rows: readonly MetricRow[], opts: { threshold?: number; resamples?: number } = {}): EdgeMetrics {
  const rs = rows.map((x) => x.r);
  const n = rs.length;
  const cls = rs.map((r) => resultClass(r, opts.threshold));
  const winsR = rs.filter((_, i) => cls[i] === 'W');
  const lossesR = rs.filter((_, i) => cls[i] === 'L');
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const netR = rs.reduce((a, b) => a + b, 0);
  const avgWin = mean(winsR); const avgLoss = mean(lossesR);
  const expectancy = n ? netR / n : null;
  const sd = n > 1 ? Math.sqrt(rs.reduce((a, r) => a + (r - (expectancy as number)) ** 2, 0) / (n - 1)) : null;

  // Drawdown from the running peak (starting at 0), and how long the deepest one took to recover.
  let cum = 0; let peak = 0; let maxDD = 0; let troughAt = -1; let peakAtTrough = 0; let recovered: number | null = null;
  rs.forEach((r, i) => {
    cum += r;
    if (cum > peak) peak = cum;
    if (cum - peak < maxDD) { maxDD = cum - peak; troughAt = i; peakAtTrough = peak; recovered = null; }
    else if (troughAt >= 0 && recovered == null && cum >= peakAtTrough) recovered = i - troughAt;
  });
  let streak = 0; let longest = 0;
  for (const c of cls) { if (c === 'L') { streak += 1; longest = Math.max(longest, streak); } else if (c === 'W') streak = 0; }

  const priced = rows.map((x) => x.money).filter((v): v is number => v != null);
  return {
    n, wins: winsR.length, losses: lossesR.length, be: n - winsR.length - lossesR.length,
    winRate: winsR.length + lossesR.length ? winsR.length / (winsR.length + lossesR.length) : null,
    winRateCI: wilson(winsR.length, winsR.length + lossesR.length),
    avgWin, avgLoss, expectancy,
    expectancyCI: bootstrapMean(rs, { resamples: opts.resamples }),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    breakevenWinRate: avgWin != null && avgLoss != null ? Math.abs(avgLoss) / (avgWin + Math.abs(avgLoss)) : null,
    grossWin, grossLoss, netR,
    netMoney: priced.length ? priced.reduce((a, b) => a + b, 0) : null, pricedN: priced.length,
    sd, maxDrawdownR: maxDD, longestLosingStreak: longest,
    recoveryTrades: troughAt >= 0 ? recovered : null, stillUnderwater: troughAt >= 0 && recovered == null,
    tradesFor95: expectancy != null && expectancy > 0 && sd != null ? Math.ceil((1.645 * sd / expectancy) ** 2) : null,
  };
}

/**
 * Rule adherence, the only definition: a trade followed the rules when the
 * rule book (lib/ruleBook.ts — trade rules and day rules) finds nothing broken.
 */
export function adherence<T>(trades: readonly T[], breaks: (t: T) => readonly unknown[]): { kept: number; n: number; rate: number | null } {
  const kept = trades.filter((t) => breaks(t).length === 0).length;
  return { kept, n: trades.length, rate: trades.length ? kept / trades.length : null };
}
