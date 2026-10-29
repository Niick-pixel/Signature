/**
 * The adaptive setup score (Edge Engine §5.5) — the part that learns.
 *
 * It predicts R from the 9 checklist items (your rubric's points as the
 * prior) plus closure score, liquidity event, a named target, with the bias,
 * the right side of the range, and inside the killzone (prior 0).
 *
 * Bayesian linear regression with a Normal prior centred on your weights:
 *
 *   features standardised (z = (x − mean) / sd), missing → the feature's mean
 *   prior   β₀_j = s · points_j · sd_j   (your points in R, via one scale s)
 *   s       fitted freely by least squares of R on the points-weighted sum,
 *           floored at 0 (a prior is your rubric, never its reverse)
 *   post    β = (XᵀWX + λI)⁻¹ (XᵀW(y − ȳ) + λβ₀),  λ = n₀ = 40 pseudo-trades
 *   cov     σ² (XᵀWX + λI)⁻¹,  σ² from the weighted residuals
 *
 * At 34 trades the learned weights barely leave yours; past 150 your data
 * dominates. That is the learning curve, and it is honest.
 *
 * Judged out of sample only (walk-forward): for t = 20…N−1 fit on the trades
 * before t and score trade t. Spearman ρ (prediction vs R) with a bootstrap
 * interval, MSE skill against a constant (the mean of the trades before t),
 * and the same for your raw checklist score. Calibration: those predictions
 * in buckets against the R that followed.
 */
import { cholesky, cholInverse, cholSolve, zeros, type Mat } from './linalg';
import { FIELDS } from './fields';
import { mulberry32, seedOf } from './rng';
import { recencyWeights } from './recency';
import { Z80 } from './dist';
import { closureScore } from '../anatomy';
import { datasetHash } from './engine';
import type { Trade } from '../types';

export const N0 = 40; export const WF_START = 20;

export interface ScoreFeature { key: string; label: string; points: number; get: (t: Trade) => number | null }

const b = (v: unknown) => (v == null ? null : v ? 1 : 0);
export const SCORE_FEATURES: ScoreFeature[] = [
  ...FIELDS.filter((f) => f.points != null).map((f) => ({ key: f.key, label: f.label, points: f.points!, get: (t: Trade) => b(f.get(t)) })),
  { key: 'sweep_tier', label: 'Clear sweep of a nameable level', points: 20, get: (t) => (t.sweep_tier == null ? null : t.sweep_tier === 'major' ? 1 : t.sweep_tier === 'minor' ? 0.6 : 0) },
  { key: 'singular_gap', label: 'One clean FVG', points: 10, get: (t) => b(t.singular_gap) },
  { key: 'closure_score', label: 'Closure score', points: 0, get: (t) => { const c = closureScore(t); return c == null ? null : c / 10; } },
  { key: 'liquidity_event', label: 'A liquidity event', points: 0, get: (t) => (t.liquidity_event == null ? null : t.liquidity_event !== 'None' ? 1 : 0) },
  { key: 'target_named', label: 'A named target', points: 0, get: (t) => (t.target_type == null ? null : t.target_type !== 'Other' ? 1 : 0) },
  { key: 'with_bias', label: 'With the HTF bias', points: 0, get: (t) => (t.htf_bias === 'With bias' ? 1 : t.htf_bias === 'Against bias' ? 0 : null) },
  { key: 'location_aligned', label: 'Right side of the range', points: 0,
    get: (t) => (!t.premium_discount || t.premium_discount === 'Equilibrium' ? null : (t.direction === 'Long') === (t.premium_discount === 'Discount') ? 1 : 0) },
  { key: 'killzone_in', label: 'Inside the killzone', points: 0, get: (t) => (t.chk_killzone == null ? null : t.chk_killzone ? 1 : 0) },
];

export interface Fit { p: number; n: number; mean: number[]; sd: number[]; beta: number[]; beta0: number[]; cov: Mat; intercept: number; s: number; sigma2: number }

/** The raw design: one row per trade, missing filled with the column's mean (a fact about the inputs, never R). */
export function design(trades: readonly Trade[], features = SCORE_FEATURES): number[][] {
  const raw = trades.map((t) => features.map((f) => f.get(t)));
  const fill = features.map((_, j) => { const xs = raw.map((r) => r[j]).filter((v): v is number => v != null); return xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : 0; });
  return raw.map((r) => r.map((v, j) => v ?? fill[j]));
}

export function fitScore(X: readonly number[][], y: readonly number[], w: readonly number[] = y.map(() => 1), features = SCORE_FEATURES, n0 = N0): Fit {
  const n = X.length; const p = features.length;
  const W = w.reduce((a, c) => a + c, 0) || 1;
  const mean = Array.from({ length: p }, (_, j) => X.reduce((a, r, i) => a + w[i] * r[j], 0) / W);
  const sd = Array.from({ length: p }, (_, j) => Math.sqrt(X.reduce((a, r, i) => a + w[i] * (r[j] - mean[j]) ** 2, 0) / W));
  const ybar = y.reduce((a, v, i) => a + w[i] * v, 0) / W;
  const Z = X.map((r) => r.map((v, j) => (sd[j] > 0 ? (v - mean[j]) / sd[j] : 0)));
  // The scale s: least squares of R on the points-weighted sum of the checklist items.
  const P = X.map((r) => r.reduce((a, v, j) => a + features[j].points * v, 0));
  const pm = P.reduce((a, v, i) => a + w[i] * v, 0) / W;
  const vp = P.reduce((a, v, i) => a + w[i] * (v - pm) ** 2, 0);
  const s = vp > 0 ? Math.max(0, P.reduce((a, v, i) => a + w[i] * (v - pm) * (y[i] - ybar), 0) / vp) : 0;
  const beta0 = features.map((f, j) => s * f.points * sd[j]);
  const A = zeros(p); const rhs = new Array(p).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) {
    rhs[j] += w[i] * Z[i][j] * (y[i] - ybar);
    for (let k = 0; k <= j; k++) A[j][k] += w[i] * Z[i][j] * Z[i][k];
  }
  for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) A[k][j] = A[j][k]; A[j][j] += n0; rhs[j] += n0 * beta0[j]; }
  const L = cholesky(A);
  const beta = cholSolve(L, rhs);
  const resid = Z.map((r, i) => y[i] - ybar - r.reduce((a, v, j) => a + v * beta[j], 0));
  const sigma2 = Math.max(1e-6, resid.reduce((a, e, i) => a + w[i] * e * e, 0) / Math.max(1, W - 1));
  const inv = cholInverse(L);
  return { p, n, mean, sd, beta, beta0, cov: inv.map((r) => r.map((v) => v * sigma2)), intercept: ybar, s, sigma2 };
}

export const predict = (f: Fit, x: readonly number[]) => f.intercept + x.reduce((a, v, j) => a + (f.sd[j] > 0 ? ((v - f.mean[j]) / f.sd[j]) * f.beta[j] : 0), 0);

export interface Weight { key: string; label: string; points: number; prior: number; learned: number; lo80: number; hi80: number; chip: 'earning' | 'overweighted' | 'too-early' | 'none' }

/** Per feature: R when present vs absent (raw units) — your points in R, and what the data now says. */
export function weights(f: Fit, n: number, features = SCORE_FEATURES): Weight[] {
  return features.map((ft, j) => {
    const sd = f.sd[j];
    if (!(sd > 0)) return { key: ft.key, label: ft.label, points: ft.points, prior: f.s * ft.points, learned: f.s * ft.points, lo80: NaN, hi80: NaN, chip: 'none' as const };
    const learned = f.beta[j] / sd; const half = (Z80 * Math.sqrt(f.cov[j][j])) / sd; const prior = f.s * ft.points;
    const chip = n < 30 ? 'too-early' : learned - half > 0 && learned - half >= prior * 0.5 ? 'earning' : ft.points > 0 && learned + half < prior ? 'overweighted' : 'too-early';
    return { key: ft.key, label: ft.label, points: ft.points, prior, learned, lo80: learned - half, hi80: learned + half, chip };
  });
}

/* ───────── walk-forward, out of sample ───────── */

function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length).fill(0);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
export function spearman(a: readonly number[], b: readonly number[]): number | null {
  const n = a.length; if (n < 3) return null;
  const ra = ranks(a); const rb = ranks(b);
  const ma = ra.reduce((s, v) => s + v, 0) / n; const mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}

export interface Skill { rho: number | null; lo80: number | null; hi80: number | null; pPositive: number | null; mseSkill: number | null }
export interface WalkForward { n: number; skippedExposed: number; preds: number[]; actual: number[]; checklist: number[]; model: Skill; rubric: Skill; calibration: Array<{ lo: number; hi: number; predicted: number; realized: number; ci80: number; n: number }> }

const mseSkillOf = (pred: number[], actual: number[], base: number[]) => {
  const n = pred.length; if (!n) return null;
  const mse = pred.reduce((a, v, i) => a + (v - actual[i]) ** 2, 0) / n; const mse0 = base.reduce((a, v, i) => a + (v - actual[i]) ** 2, 0) / n;
  return mse0 > 0 ? 1 - mse / mse0 : null;
};

function skill(pred: number[], actual: number[], base: number[], salt: string): Skill {
  const n = pred.length;
  // Fewer resamples on long histories: the interval is already tight, and each one re-ranks n values.
  const B = n > 300 ? 400 : 2000;
  if (n < 5) return { rho: null, lo80: null, hi80: null, pPositive: null, mseSkill: null };
  const rho = spearman(pred, actual);
  const rand = mulberry32(seedOf(actual, `wf|${salt}`)); const boots: number[] = [];
  for (let b = 0; b < B; b++) { const ia = Array.from({ length: n }, () => Math.floor(rand() * n)); const r = spearman(ia.map((i) => pred[i]), ia.map((i) => actual[i])); if (r != null) boots.push(r); }
  boots.sort((x, y) => x - y);
  const q = (p: number) => boots[Math.min(boots.length - 1, Math.floor(p * boots.length))];
  return { rho, lo80: boots.length ? q(0.1) : null, hi80: boots.length ? q(0.9) : null, pPositive: boots.length ? boots.filter((r) => r > 0).length / boots.length : null, mseSkill: mseSkillOf(pred, actual, base) };
}

/**
 * Incremental: running sums of x, xxᵀ, x·y, y let each step standardise and
 * fit in O(p²) + a p×p solve, so 2,000 trades stay fast. Unweighted.
 */
export function walkForward(trades: readonly Trade[], features = SCORE_FEATURES, opts: { score?: (t: Trade) => boolean } = {}): WalkForward | null {
  // Scored only where the checklist was filled before the outcome: a checklist ticked in hindsight can
  // carry the result, so it trains the model (that can only hurt it) but never counts as a test.
  const score = opts.score ?? ((t: Trade) => !t.graded_post_hoc);
  let skippedExposed = 0;
  const N = trades.length; if (N <= WF_START + 4) return null;
  const X = design(trades, features); const y = trades.map((t) => t.r_multiple as number); const p = features.length;
  const cs = trades.map((t) => t.checklist_score ?? 0);
  const Sx = new Array(p).fill(0); const Sxx = zeros(p); const Sxy = new Array(p).fill(0); let Sy = 0; const pts = features.map((f) => f.points);
  let SP = 0; let SPP = 0; let SPy = 0; let Sc = 0; let Scc = 0; let Scy = 0;
  const add = (i: number) => {
    const x = X[i]; Sy += y[i]; const P = x.reduce((a, v, j) => a + pts[j] * v, 0); SP += P; SPP += P * P; SPy += P * y[i];
    Sc += cs[i]; Scc += cs[i] * cs[i]; Scy += cs[i] * y[i];
    for (let j = 0; j < p; j++) { Sx[j] += x[j]; Sxy[j] += x[j] * y[i]; for (let k = 0; k <= j; k++) Sxx[j][k] += x[j] * x[k]; }
  };
  for (let i = 0; i < WF_START; i++) add(i);
  const preds: number[] = []; const actual: number[] = []; const base: number[] = []; const chk: number[] = []; const chkPred: number[] = [];
  for (let t = WF_START; t < N; t++) {
    const n = t; const mean = Sx.map((v) => v / n); const ybar = Sy / n;
    const sd = mean.map((m, j) => Math.sqrt(Math.max(0, Sxx[j][j] / n - m * m)));
    const pm = SP / n; const vp = SPP / n - pm * pm; const s = vp > 1e-12 ? Math.max(0, (SPy / n - pm * ybar) / vp) : 0;
    const A = zeros(p); const rhs = new Array(p).fill(0);
    for (let j = 0; j < p; j++) {
      const dj = sd[j] > 0 ? sd[j] : 0;
      rhs[j] = dj ? (Sxy[j] - n * mean[j] * ybar) / dj : 0;
      for (let k = 0; k <= j; k++) { const dk = sd[k] > 0 ? sd[k] : 0; A[j][k] = dj && dk ? (Sxx[j][k] - n * mean[j] * mean[k]) / (dj * dk) : 0; A[k][j] = A[j][k]; }
    }
    for (let j = 0; j < p; j++) { A[j][j] += N0; rhs[j] += N0 * s * pts[j] * sd[j]; }
    if (!score(trades[t])) { skippedExposed += 1; add(t); continue; }
    const beta = cholSolve(cholesky(A), rhs);
    preds.push(ybar + X[t].reduce((a, v, j) => a + (sd[j] > 0 ? ((v - mean[j]) / sd[j]) * beta[j] : 0), 0));
    actual.push(y[t]); base.push(ybar);
    // Your raw checklist score, mapped to R by a line fitted on the past only.
    const cm = Sc / n; const vc = Scc / n - cm * cm; const bc = vc > 1e-12 ? (Scy / n - cm * ybar) / vc : 0;
    chk.push(cs[t]); chkPred.push(ybar + bc * (cs[t] - cm));
    add(t);
  }
  if (!preds.length) return { n: 0, skippedExposed, preds, actual, checklist: chk, model: skill([], [], [], 'model'), rubric: skill([], [], [], 'rubric'), calibration: [] };
  const model = skill(preds, actual, base, 'model');
  const rubricSk = skill(chk, actual, base, 'rubric');
  const rubric = { ...rubricSk, mseSkill: mseSkillOf(chkPred, actual, base) };
  // Calibration: predictions in quintiles (tertiles under 50).
  const k = preds.length >= 50 ? 5 : 3;
  const order = preds.map((v, i) => i).sort((a, b) => preds[a] - preds[b]);
  const calibration = Array.from({ length: k }, (_, b) => {
    const ids = order.slice(Math.floor((b * order.length) / k), Math.floor(((b + 1) * order.length) / k));
    const ps = ids.map((i) => preds[i]); const as = ids.map((i) => actual[i]); const m = as.reduce((a, v) => a + v, 0) / (as.length || 1);
    const sdv = as.length > 1 ? Math.sqrt(as.reduce((a, v) => a + (v - m) ** 2, 0) / (as.length - 1)) : 0;
    return { lo: Math.min(...ps), hi: Math.max(...ps), predicted: ps.reduce((a, v) => a + v, 0) / (ps.length || 1), realized: m, ci80: as.length ? (Z80 * sdv) / Math.sqrt(as.length) : 0, n: as.length };
  }).filter((c) => c.n > 0);
  return { n: preds.length, skippedExposed, preds, actual, checklist: chk, model, rubric, calibration };
}

export interface ScoreModel { fit: Fit; weights: Weight[]; wf: WalkForward | null; n: number }

/** `trades`: settled with an R, oldest first. Recency weights apply to the final fit when `halfLife` is set. */
const cache = new Map<string, ScoreModel | null>();

export function scoreModel(trades: readonly Trade[], opts: { halfLife?: number | null } = {}): ScoreModel | null {
  if (trades.length < 8) return null;
  // Cached by the data: same trades, same answer, computed once (walk-forward at 2,000 trades is ~0.7 s).
  const key = datasetHash(trades, { halfLife: opts.halfLife ?? null } as never) + trades.map((t) => `${t.graded_post_hoc ? 1 : 0}${t.checklist_score}`).join('');
  if (cache.has(key)) return cache.get(key)!;
  const out = scoreModelUncached(trades, opts);
  cache.set(key, out); if (cache.size > 8) cache.delete(cache.keys().next().value as string);
  return out;
}

function scoreModelUncached(trades: readonly Trade[], opts: { halfLife?: number | null }): ScoreModel | null {
  const X = design(trades); const y = trades.map((t) => t.r_multiple as number);
  const fit = fitScore(X, y, recencyWeights(trades.length, opts.halfLife ?? null));
  return { fit, weights: weights(fit, trades.length), wf: walkForward(trades), n: trades.length };
}
