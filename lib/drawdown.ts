/**
 * What's normal pain? Your own results, reshuffled into thousands of futures.
 *
 * Each simulated future draws its trades at random, with replacement, from
 * the R results already in the journal (a bootstrap). Across them: how deep
 * the worst drawdown usually gets, how long the worst losing streak runs, and
 * how often a dollar limit would be hit at a given risk per trade.
 *
 * It assumes the next trades look like the last ones — no better, no worse.
 * Seeded, so the same journal always gives the same answer.
 */
export interface DrawdownSim {
  runs: number;
  trades: number;
  /** Worst peak-to-trough drop of each run, in R, sorted ascending. */
  maxDrawdowns: number[];
  /** Longest run of consecutive losses in each run, sorted ascending. */
  streaks: number[];
  /** Cumulative R at the end of each run, sorted ascending. */
  finals: number[];
}

export const MIN_SIM_SAMPLE = 10;

/** mulberry32: a small, fast, seedable generator. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateDrawdowns(rs: readonly number[], trades = 100, runs = 2000, seed = 7): DrawdownSim | null {
  if (rs.length < MIN_SIM_SAMPLE) return null;
  const next = rng(seed);
  const maxDrawdowns: number[] = [];
  const streaks: number[] = [];
  const finals: number[] = [];
  for (let run = 0; run < runs; run++) {
    let equity = 0, peak = 0, worst = 0, streak = 0, longest = 0;
    for (let i = 0; i < trades; i++) {
      const r = rs[Math.floor(next() * rs.length)];
      equity += r;
      if (equity > peak) peak = equity;
      if (peak - equity > worst) worst = peak - equity;
      streak = r < 0 ? streak + 1 : 0;
      if (streak > longest) longest = streak;
    }
    maxDrawdowns.push(worst);
    streaks.push(longest);
    finals.push(equity);
  }
  const up = (x: number, y: number) => x - y;
  return { runs, trades, maxDrawdowns: maxDrawdowns.sort(up), streaks: streaks.sort(up), finals: finals.sort(up) };
}

/** The value below which a share `p` (0–1) of the sorted list falls. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/** Share of runs whose worst drawdown reaches `limitR`. */
export function chanceOfReaching(sim: DrawdownSim, limitR: number): number {
  if (limitR <= 0) return 0;
  let lo = 0, hi = sim.maxDrawdowns.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sim.maxDrawdowns[mid] < limitR) lo = mid + 1; else hi = mid; }
  return (sim.maxDrawdowns.length - lo) / sim.maxDrawdowns.length;
}
