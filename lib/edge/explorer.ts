/**
 * The setup anatomy explorer: every level of every pre field (lib/edge/fields
 * PREDICTORS) against the rest of your trades, honestly.
 *
 *  1. Group the trades by the field's levels (numbers: by value when there are
 *     6 or fewer, else above / below the median).
 *  2. Shrink each level's mean R toward the global mean (lib/edge/shrink), with
 *     recency weights (lib/edge/recency) — effective n everywhere.
 *  3. Level vs the rest: the difference of the two shrunk means, its SD, and
 *     P(difference > 0) from the normal approximation.
 *  4. A raw p-value (Welch's t, Welch–Satterthwaite df) for every testable row, and
 *     Benjamini–Hochberg at q = 0.10 across the whole table: a row that does
 *     not survive cannot claim more than Too early.
 *  5. The verdict (lib/edge/verdict) from the shrunk difference.
 *
 * Rows with fewer than 3 trades on either side, or no variation, are hidden.
 * The leakage firewall: any field that is not a pre predictor is refused.
 */
import { benjaminiHochberg, BH_Q } from './bh';
import { normCdf, tTwoSided, Z80, Z95, type BetaPosterior } from './dist';
import { PREDICTORS, type FieldDef, type FieldValue } from './fields';
import { resultClass } from './metrics';
import { DEFAULT_HALF_LIFE, recencyWeights, weightedMoments } from './recency';
import { shrinkGroups } from './shrink';
import { DEFAULT_THRESHOLDS, MIN_N, verdict, type Thresholds, type Verdict } from './verdict';
import type { Trade } from '../types';

/** Under this many trades (maturity tier 0), a slice must be extreme to say more than Too early. */
export const TIER1 = 30;

export class LeakageError extends Error {}

/** Throws if a field is not a pre-trade predictor: the result must never predict itself. */
export function assertFirewall(fields: readonly FieldDef[]): void {
  const bad = fields.filter((f) => f.timing !== 'pre' || !f.predictor);
  if (bad.length) throw new LeakageError(`Leakage firewall: ${bad.map((f) => `${f.key} (${f.timing})`).join(', ')} cannot predict R.`);
}

export interface ExplorerRow {
  field: string; label: string; level: string;
  n: number; nEff: number; rawMean: number;
  shrunk: number; sd: number; lo80: number; hi80: number; lo95: number; hi95: number;
  winRate: BetaPosterior;
  restN: number; restShrunk: number;
  /** Shrunk level minus shrunk rest, with its SD and P(> 0). */
  diff: number; diffSd: number; pBetter: number;
  pValue: number | null; tested: boolean; survivesBH: boolean;
  verdict: Verdict; reason: string | null;
  hidden: boolean;
  tradeIds: string[];
}
export interface Explorer { rows: ExplorerRow[]; tests: number; mu: number; n: number; q: number }

export interface ExploreOptions {
  halfLife?: number | null; thresholds?: Thresholds; prior?: { mu: number; pBar: number };
  /**
   * Backtests as a discounted prior (§5.13): each replay trade counts `weight` (default 0.3) of a
   * live one, added to its level as pseudo-trades — replay is optimistic (no fear, hindsight).
   */
  backtest?: { trades: readonly Trade[]; weight: number };
  /** Multiplies the shrinkage strength (interactions use 2). */
  kScale?: number;
}
export const BACKTEST_WEIGHT = 0.3;

function levelOf(f: FieldDef, v: FieldValue, median: number | null): string | null {
  if (v == null) return null;
  if (f.kind === 'num' && median != null) return (v as number) >= median ? `≥ ${median}` : `< ${median}`;
  if (f.kind === 'bool') return v ? 'Yes' : 'No';
  return String(v);
}

/** `trades`: settled, with an R, oldest first. */
export function explore(trades: readonly Trade[], fields: readonly FieldDef[] = PREDICTORS, opts: ExploreOptions = {}): Explorer {
  assertFirewall(fields);
  const halfLife = opts.halfLife === undefined ? DEFAULT_HALF_LIFE : opts.halfLife;
  const w = recencyWeights(trades.length, halfLife);
  const rs = trades.map((t) => t.r_multiple as number);
  const global = weightedMoments(rs, w);
  const rows: ExplorerRow[] = [];
  const bt = opts.backtest?.trades.filter((t) => t.r_multiple != null) ?? []; const btW = opts.backtest?.weight ?? 0;
  const btRs = bt.map((t) => t.r_multiple as number);
  // With backtests as the prior, the overall mean blends both, replay discounted.
  const prior = opts.prior ?? (bt.length && btW > 0 ? (() => {
    const sw = w.reduce((a, b) => a + b, 0);
    const mu = (rs.reduce((a, r, i) => a + w[i] * r, 0) + btW * btRs.reduce((a, b) => a + b, 0)) / (sw + btW * bt.length);
    const W = rs.filter((r) => resultClass(r) === 'W').length + btW * btRs.filter((r) => resultClass(r) === 'W').length;
    const L = rs.filter((r) => resultClass(r) === 'L').length + btW * btRs.filter((r) => resultClass(r) === 'L').length;
    return { mu, pBar: W + L ? W / (W + L) : 0.5 };
  })() : undefined);

  for (const f of fields) {
    const vals = trades.map((t) => f.get(t));
    let median: number | null = null;
    if (f.kind === 'num') {
      const nums = vals.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
      if (new Set(nums).size > 6) median = nums[Math.floor(nums.length / 2)];
    }
    const byLevel = new Map<string, number[]>();
    vals.forEach((v, i) => { const l = levelOf(f, v, median); if (l == null) return; const a = byLevel.get(l); if (a) a.push(i); else byLevel.set(l, [i]); });
    if (byLevel.size < 2) continue;
    const groups = [...byLevel].map(([key, idx]) => ({
      key, idx, x: idx.map((i) => rs[i]), w: idx.map((i) => w[i]),
      wins: idx.filter((i) => resultClass(rs[i]) === 'W').reduce((a, i) => a + w[i], 0),
      losses: idx.filter((i) => resultClass(rs[i]) === 'L').reduce((a, i) => a + w[i], 0),
    }));
    const sh = shrinkGroups(groups, { ...(prior ? { prior } : {}), kScale: opts.kScale });
    const mu = sh.mu;
    // Replay trades at each level, as discounted pseudo-trades.
    const btAt = new Map<string, number[]>();
    if (btW > 0) bt.forEach((t, i) => { const l = levelOf(f, f.get(t), median); if (l == null) return; const a = btAt.get(l); if (a) a.push(btRs[i]); else btAt.set(l, [btRs[i]]); });
    const pseudo = (xs: number[]) => ({ a: btW * xs.length, sum: btW * xs.reduce((a, b) => a + b, 0) });
    // Two levels mirror each other: one row says it (Yes, or the first level).
    const levels = groups.length === 2 ? [groups.find((g) => g.key === 'Yes') ?? groups[0]] : groups;
    for (const g of levels) {
      const s0 = sh.groups.find((x) => x.key === g.key)!;
      const restIdx = groups.filter((o) => o.key !== g.key).flatMap((o) => o.idx);
      const rest = weightedMoments(restIdx.map((i) => rs[i]), restIdx.map((i) => w[i]));
      const lvl = weightedMoments(g.x, g.w);
      const pg = pseudo(btAt.get(g.key) ?? []);
      const pr = pseudo([...btAt].filter(([k]) => k !== g.key).flatMap(([, xs]) => xs));
      const s = { ...s0, shrunk: (lvl.nEff * lvl.mean + pg.sum + sh.k * mu) / (lvl.nEff + pg.a + sh.k), sd: Math.sqrt(sh.sigma2 / (lvl.nEff + pg.a + sh.k)) };
      const restShrunk = (rest.nEff * rest.mean + pr.sum + sh.k * mu) / (rest.nEff + pr.a + sh.k);
      const restSd = Math.sqrt(sh.sigma2 / (rest.nEff + pr.a + sh.k));
      const diff = s.shrunk - restShrunk; const diffSd = Math.sqrt(s.sd ** 2 + restSd ** 2);
      // Welch: each side's own variance, Student's t with Welch–Satterthwaite degrees of freedom —
      // honest with 8 or 10 trades a side, where the normal approximation is overconfident.
      const va = (lvl.variance || sh.sigma2) / Math.max(1, lvl.nEff); const vb = (rest.variance || sh.sigma2) / Math.max(1, rest.nEff);
      const se = Math.sqrt(va + vb);
      const df = (va + vb) ** 2 / ((va ** 2) / Math.max(1, lvl.nEff - 1) + (vb ** 2) / Math.max(1, rest.nEff - 1));
      const zeroVar = sh.sigma2 === 0 || (lvl.variance === 0 && rest.variance === 0 && lvl.mean === rest.mean);
      const hidden = g.x.length < 3 || restIdx.length < 3 || zeroVar;
      const tested = !hidden && lvl.nEff >= MIN_N && rest.nEff >= MIN_N;
      rows.push({
        field: f.key, label: f.label, level: g.key, n: g.x.length, nEff: lvl.nEff, rawMean: lvl.mean,
        shrunk: s.shrunk, sd: s.sd, lo80: s.shrunk - Z80 * s.sd, hi80: s.shrunk + Z80 * s.sd, lo95: s.shrunk - Z95 * s.sd, hi95: s.shrunk + Z95 * s.sd,
        winRate: s.winRate, restN: restIdx.length, restShrunk,
        diff, diffSd, pBetter: diffSd > 0 ? normCdf(diff / diffSd) : 0.5,
        pValue: tested && se > 0 ? tTwoSided((lvl.mean - rest.mean) / se, df) : null,
        tested, survivesBH: false, verdict: { level: 'too-early', direction: null, p: 0.5 }, reason: null, hidden,
        tradeIds: g.idx.map((i) => trades[i].id),
      });
    }
  }

  const testedRows = rows.filter((r) => r.tested);
  const keep = benjaminiHochberg(testedRows.map((r) => r.pValue as number));
  testedRows.forEach((r, i) => { r.survivesBH = keep[i]; });
  for (const r of rows) {
    const v = verdict({ n: r.nEff, pPositive: r.pBetter, lo80: r.diff - Z80 * r.diffSd, hi80: r.diff + Z80 * r.diffSd }, opts.thresholds ?? DEFAULT_THRESHOLDS);
    if (!r.tested) { r.verdict = { ...v, level: 'too-early', direction: null }; r.reason = r.hidden ? 'too few trades or no variation' : `fewer than ${MIN_N} trades on a side`; }
    else if (!r.survivesBH) { r.verdict = { ...v, level: 'too-early', direction: null }; r.reason = `not clear after correcting for ${testedRows.length} comparisons`; }
    // Tier 0 (under 30 trades): Too early unless extreme — P ≥ 0.99 and at least half an R apart.
    else if (trades.length < TIER1 && !(r.verdict = v, v.p >= 0.99 && Math.abs(r.diff) >= 0.5)) { r.verdict = { ...v, level: 'too-early', direction: null }; r.reason = `under ${TIER1} trades, only an extreme gap speaks`; }
    else { r.verdict = v; r.reason = v.level === 'too-early' ? 'interval still spans good and bad' : null; }
  }
  return { rows, tests: testedRows.length, mu: prior?.mu ?? global.mean, n: trades.length, q: BH_Q };
}
