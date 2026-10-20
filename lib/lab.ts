/**
 * Three studies of my own trades, all pure and local:
 *
 *   targetScorecard   which targets price actually reaches, and what they pay
 *   managementLab     what other management plans would have paid, replayed
 *                     from how far each trade ran (max R) and how it ended
 *   gradePredictors   why A grades lose: what A-graded losers have in common,
 *                     and which checklist box, made a gate, would have
 *                     separated winners from losers best — tested on history
 */
import { CHECKLIST_ITEMS, isHypothetical, isTaken } from './domain';
import { EARLY_N, themesOf, THEMES } from './insights';
import type { Trade } from './types';

const round = (v: number | null, dp = 2) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

/** Taken trades with a result: real or replayed, never Missed, never a plan. */
export const studied = (trades: readonly Trade[]) => trades
  .filter((t) => !t.deleted_at && !isHypothetical(t.account) && isTaken(t.outcome) && t.status !== 'Planned' && t.r_multiple != null)
  .sort((a, b) => a.date.localeCompare(b.date));

/* ---------------------------------------------------------- targets */

export interface TargetRow {
  target: string;
  n: number;
  /** Reached the target: answered "target hit", or a win. */
  reached: number;
  reachedRate: number | null;
  /** Average max R reached, on trades that logged it. */
  avgMaxR: number | null;
  avgR: number | null;
  netR: number;
  /** The same target with a named sweep first, and without. */
  swept: { n: number; avgR: number | null };
  notSwept: { n: number; avgR: number | null };
  early: boolean;
}

/** Per target type, best average R first. */
export function targetScorecard(trades: readonly Trade[]): TargetRow[] {
  const ts = studied(trades);
  const groups = new Map<string, Trade[]>();
  for (const t of ts) groups.set(t.target_type, [...(groups.get(t.target_type) ?? []), t]);
  const sub = (xs: Trade[]) => ({ n: xs.length, avgR: round(mean(xs.map((t) => t.r_multiple as number))) });
  return [...groups].map(([target, xs]) => {
    const reached = xs.filter((t) => t.target_hit === true || (t.target_hit == null && t.outcome === 'Win')).length;
    const maxR = xs.filter((t) => t.mfe_r != null && t.mfe_r < 50).map((t) => t.mfe_r as number);
    return {
      target, n: xs.length, reached,
      reachedRate: round(reached / xs.length, 3),
      avgMaxR: round(mean(maxR)),
      avgR: round(mean(xs.map((t) => t.r_multiple as number))),
      netR: round(xs.reduce((s, t) => s + (t.r_multiple as number), 0)) ?? 0,
      swept: sub(xs.filter((t) => t.sweep_tier === 'major' || t.sweep_tier === 'minor')),
      notSwept: sub(xs.filter((t) => t.sweep_tier === 'none')),
      early: xs.length < EARLY_N,
    };
  }).sort((a, b) => (b.avgR ?? -99) - (a.avgR ?? -99) || b.n - a.n);
}

/* ------------------------------------------------------- management */

export interface PlanResult {
  id: string;
  label: string;
  /** Trades the chart can decide under this plan. */
  decided: number;
  /** Trades it cannot (ended flat before the level that matters): counted at both extremes. */
  unsure: number;
  netR: number;
  avgR: number | null;
  /** Net R if every unsure trade had hit the stop, and if each had kept its actual result. */
  worst: number;
  best: number;
  winRate: number | null;
}

/**
 * What a trade would have paid under a plan, from its max R and outcome.
 * `null` when the chart cannot tell: a trade closed flat before reaching the
 * level the plan cares about might have gone on to the stop or the target.
 * A winner is assumed to have reached its target at its actual R.
 */
type Sim = (t: Trade, maxR: number) => number | null;

const won = (t: Trade) => t.outcome === 'Win';
const lost = (t: Trade) => t.outcome === 'Loss';

export const PLANS: Array<{ id: string; label: string; sim: Sim }> = [
  { id: 'actual', label: 'As traded', sim: (t) => t.r_multiple },
  {
    id: 'hold', label: 'Hold to stop or target',
    // A win is a win; a loss a loss; a breakeven exit could have gone either way.
    sim: (t) => (won(t) ? t.r_multiple : lost(t) ? -1 : null),
  },
  {
    id: 'be1r', label: 'Breakeven at 1R',
    sim: (t, m) => (m >= 1 ? (won(t) ? t.r_multiple : 0) : lost(t) ? -1 : won(t) ? t.r_multiple : null),
  },
  {
    id: 'partial1r', label: 'Half off at 1R, runner to target',
    sim: (t, m) => (m >= 1 ? 0.5 + 0.5 * (won(t) ? (t.r_multiple as number) : 0) : lost(t) ? -1 : won(t) ? t.r_multiple : null),
  },
  ...[1, 1.5, 2].map((x) => ({
    id: `tp${x}`, label: `Take profit at ${x}R`,
    sim: ((t, m) => (m >= x ? x : lost(t) ? -1 : won(t) && (t.r_multiple as number) < x ? t.r_multiple : null)) as Sim,
  })),
];

export interface LabResult {
  n: number;
  plans: PlanResult[];
  /** How far trades ran on average, and how many reached 1R at all. */
  avgMaxR: number | null;
  reached1R: number;
  /** In words: is management the leak, or the entries? */
  verdict: 'management' | 'entries' | 'too-few';
  best: PlanResult | null;
}

export function managementLab(trades: readonly Trade[]): LabResult {
  const ts = studied(trades).filter((t) => t.mfe_r != null && t.mfe_r >= 0 && t.mfe_r < 50);
  const plans = PLANS.map((p) => {
    const outs = ts.map((t) => ({ t, r: p.sim(t, t.mfe_r as number) }));
    const decided = outs.filter((o) => o.r != null);
    const unsure = outs.filter((o) => o.r == null);
    const net = decided.reduce((s, o) => s + (o.r as number), 0);
    return {
      id: p.id, label: p.label, decided: decided.length, unsure: unsure.length,
      netR: round(net) ?? 0,
      avgR: round(mean(decided.map((o) => o.r as number))),
      worst: round(net - unsure.length) ?? 0,
      best: round(net + unsure.reduce((s, o) => s + (o.t.r_multiple as number), 0)) ?? 0,
      winRate: decided.length ? round(decided.filter((o) => (o.r as number) > 0).length / decided.length, 3) : null,
    };
  });
  const actual = plans[0];
  const best = [...plans.slice(1)].sort((a, b) => b.netR - a.netR)[0] ?? null;
  // A plan that would have added at least 1R per 10 trades is a management leak.
  const verdict = ts.length < EARLY_N ? 'too-few' : best && best.netR - actual.netR >= Math.max(1, ts.length / 10) ? 'management' : 'entries';
  return {
    n: ts.length, plans, best,
    avgMaxR: round(mean(ts.map((t) => t.mfe_r as number))),
    reached1R: ts.filter((t) => (t.mfe_r as number) >= 1).length,
    verdict,
  };
}

/* ----------------------------------------------------------- grades */

const A = (t: Trade) => t.grade_letter === 'A' || t.grade_letter === 'A+';

export interface ItemRow { key: string; label: string; points: number; winners: number | null; losers: number | null; gap: number | null }
export interface GateTest { key: string; label: string; aN: number; aAvgR: number | null; restAvgR: number | null; separation: number | null }

export interface GradePredictors {
  aWinners: number;
  aLosers: number;
  /** The boxes were ticked the same on A winners and A losers: the checklist cannot tell them apart. */
  sameBoxes: boolean;
  /** Per checklist box: how often it was ticked on A winners vs A losers. */
  items: ItemRow[];
  /** Target types and written patterns on A losers, most common first. */
  loserTargets: Array<{ key: string; n: number }>;
  loserThemes: Array<{ id: string; title: string; n: number }>;
  /** How well the grade separates results now: avg R of A minus avg R of the rest. */
  current: { aN: number; aAvgR: number | null; restAvgR: number | null; separation: number | null };
  /** Each box tried as an extra gate for A (not ticked → not an A), on every trade. */
  gates: GateTest[];
  /** The gate that separates best, if it beats today's grade and keeps EARLY_N A trades. */
  suggestion: GateTest | null;
}

function separation(ts: Trade[], isA: (t: Trade) => boolean) {
  const a = ts.filter(isA).map((t) => t.r_multiple as number);
  const rest = ts.filter((t) => !isA(t)).map((t) => t.r_multiple as number);
  const aAvg = mean(a);
  const rAvg = mean(rest);
  return { aN: a.length, aAvgR: round(aAvg), restAvgR: round(rAvg), separation: aAvg != null && rAvg != null ? round(aAvg - rAvg) : null };
}

export function gradePredictors(trades: readonly Trade[]): GradePredictors {
  const ts = studied(trades);
  const aw = ts.filter((t) => A(t) && t.outcome === 'Win');
  const al = ts.filter((t) => A(t) && t.outcome === 'Loss');
  const rate = (xs: Trade[], key: string) => {
    const answered = xs.filter((t) => (t as unknown as Record<string, unknown>)[key] != null);
    return answered.length ? round(answered.filter((t) => (t as unknown as Record<string, unknown>)[key] === true).length / answered.length, 3) : null;
  };
  const items = CHECKLIST_ITEMS.map((i) => {
    const w = rate(aw, i.key);
    const l = rate(al, i.key);
    return { key: i.key, label: i.label, points: i.points, winners: w, losers: l, gap: w != null && l != null ? round(w - l, 3) : null };
  }).sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));

  const count = <T,>(xs: T[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())].sort((a, b) => b[1] - a[1]);
  const loserTargets = count(al.map((t) => t.target_type)).map(([key, n]) => ({ key, n }));
  const loserThemes = count(al.flatMap((t) => themesOf(t))).map(([id, n]) => ({ id, title: THEMES.find((d) => d.id === id)?.title ?? id, n }));

  const current = separation(ts, A);
  // The sweep tier is a gate already; try every box, and a major sweep only.
  // Only facts known before the trade: boxes, the sweep, the target, confidence, the range.
  const candidates: Array<{ key: string; label: string; ok: (t: Trade) => boolean }> = [
    ...CHECKLIST_ITEMS.map((i) => ({ key: i.key, label: i.label, ok: (t: Trade) => (t as unknown as Record<string, unknown>)[i.key] !== false })),
    { key: 'sweep_major', label: 'A major level swept (not minor)', ok: (t: Trade) => t.sweep_tier === 'major' },
    ...[...new Set(ts.map((t) => t.target_type))].map((tt) => ({ key: `not:${tt}`, label: `Target is not ${tt}`, ok: (t: Trade) => t.target_type !== tt })),
    { key: 'conf4', label: 'Confidence 4★ or more', ok: (t: Trade) => (t.confidence_at_entry ?? 0) >= 4 },
    { key: 'pd', label: 'No long from premium, no short from discount', ok: (t: Trade) => (t.direction === 'Long' ? t.premium_discount !== 'Premium' : t.premium_discount !== 'Discount') },
  ];
  const gates = candidates.map((c) => ({ key: c.key, label: c.label, ...separation(ts, (t) => A(t) && c.ok(t)) }))
    .filter((g) => g.aN > 0 && g.aN < current.aN)
    .sort((a, b) => (b.separation ?? -99) - (a.separation ?? -99));
  const suggestion = gates.find((g) => g.aN >= EARLY_N && g.separation != null
    && (current.separation == null || g.separation > current.separation + 0.1)) ?? null;
  const sameBoxes = items.every((i) => i.gap == null || Math.abs(i.gap) <= 0.2);
  return { aWinners: aw.length, aLosers: al.length, sameBoxes, items, loserTargets, loserThemes, current, gates: gates.slice(0, 5), suggestion };
}
