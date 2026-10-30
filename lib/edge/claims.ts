/**
 * The insight ledger — the engine grades itself (Edge Engine §5.15).
 *
 *  - Every claim shown above Too early is recorded once per scope: the field,
 *    the level, the direction, the size, the verdict, the trades it had seen.
 *  - After 30 more trades in that scope, logged after the claim was made,
 *    the claim is re-checked on those trades only (true out of sample):
 *      held      same direction, P(that direction) ≥ 0.75
 *      reversed  the other direction, P ≥ 0.75
 *      faded     anything else
 *  - Hit rate per verdict level. If Likely claims hold under 70% of the time
 *    (5 or more checked), the Likely threshold rises 0.03 for every 10 points
 *    short (0.90 → 0.93…, at most 0.99); Hint likewise against 60%. Stricter
 *    when it was wrong, trusted when it was right.
 *  - A claim that held out of sample is what Confirmed requires.
 *  - The Brier score of the stored win-probability predictions (similar
 *    setups at the reveal): mean (p − outcome)², against always saying your
 *    base rate.
 */
import { compare } from './compare';
import { DEFAULT_THRESHOLDS, verdict, type Thresholds, type Verdict, type VerdictLevel } from './verdict';
import { resultClass } from './metrics';
import type { ExplorerRow } from './explorer';
import { field } from './fields';
import type { Trade } from '../types';

export const RECHECK_AFTER = 30;
export interface Claim { scope: string; kind: string; field: string; level: string; direction: 'positive' | 'negative'; size: number; verdict: string; n_at: number; last_trade_at: string }
export interface StoredClaim extends Claim { id: string; created_at: string; status: 'open' | 'held' | 'faded' | 'reversed'; eval_n: number | null; eval_size: number | null; eval_p: number | null }

const key = (c: Pick<Claim, 'scope' | 'field' | 'level' | 'direction'>) => `${c.scope}|${c.field}|${c.level}|${c.direction}`;

/** New claims from the explorer rows above Too early that the ledger doesn't hold yet. */
export function newClaims(rows: readonly ExplorerRow[], scope: string, n: number, lastTradeAt: string, stored: readonly StoredClaim[]): Claim[] {
  const have = new Set(stored.map(key));
  return rows.filter((r) => !r.hidden && r.verdict.level !== 'too-early' && r.verdict.direction)
    .map((r) => ({ scope, kind: 'anatomy', field: r.field, level: r.level, direction: r.verdict.direction!, size: r.diff, verdict: r.verdict.level, n_at: n, last_trade_at: lastTradeAt }))
    .filter((c) => !have.has(key(c)));
}

/** The level a trade sits at for a field, as the explorer named it ("Yes", a category, "≥ 7"). */
function levelOf(t: Trade, fieldKey: string, level: string): boolean | null {
  const f = field(fieldKey); if (!f) return null;
  const v = f.get(t); if (v == null) return null;
  if (level.startsWith('≥ ') || level.startsWith('< ')) { const m = Number(level.slice(2)); return level.startsWith('≥') ? (v as number) >= m : (v as number) < m; }
  if (f.kind === 'bool') return (v ? 'Yes' : 'No') === level;
  return String(v) === level;
}

/** Re-check a claim on the trades logged after it (`after`: settled, in its scope, with state attached). */
export function recheck(c: Claim, after: readonly Trade[]): { status: 'held' | 'faded' | 'reversed'; n: number; size: number; p: number } | null {
  if (after.length < RECHECK_AFTER) return null;
  const tagged = after.map((t) => ({ r: t.r_multiple as number, at: levelOf(t, c.field, c.level) })).filter((x) => x.at != null);
  const a = tagged.filter((x) => x.at).map((x) => x.r); const b = tagged.filter((x) => !x.at).map((x) => x.r);
  const cmp = compare(a, b, { total: 1000 }); // no tier-0 gate here: the question is direction, not verdict
  if (!cmp || a.length < 3 || b.length < 3) return null;
  const pDir = c.direction === 'positive' ? cmp.pBetter : 1 - cmp.pBetter;
  return { status: pDir >= 0.75 ? 'held' : 1 - pDir >= 0.75 ? 'reversed' : 'faded', n: a.length + b.length, size: cmp.diff, p: pDir };
}

export interface HitRate { level: string; checked: number; held: number; rate: number | null }
export function hitRates(stored: readonly StoredClaim[]): HitRate[] {
  return (['hint', 'likely', 'confirmed'] as const).map((level) => {
    const done = stored.filter((s) => s.verdict === level && s.status !== 'open');
    const held = done.filter((s) => s.status === 'held').length;
    return { level, checked: done.length, held, rate: done.length ? held / done.length : null };
  });
}

/** The thresholds after the ledger's record: raised where claims did not hold. */
export function adjustedThresholds(stored: readonly StoredClaim[], base: Thresholds = DEFAULT_THRESHOLDS): { thresholds: Thresholds; changes: Array<{ level: VerdictLevel; from: number; to: number; rate: number }> } {
  const t = { ...base }; const changes: Array<{ level: VerdictLevel; from: number; to: number; rate: number }> = [];
  const rates = hitRates(stored);
  for (const [level, target] of [['likely', 0.7], ['hint', 0.6]] as const) {
    const r = rates.find((x) => x.level === level)!;
    if (r.checked >= 5 && r.rate != null && r.rate < target) {
      const to = Math.min(0.99, base[level] + 0.03 * Math.ceil((target - r.rate) / 0.1));
      t[level] = to; changes.push({ level, from: base[level], to, rate: r.rate });
    }
  }
  if (t.likely < t.hint) t.likely = t.hint;
  return { thresholds: t, changes };
}

/** Explorer rows whose claim held out of sample may be called Confirmed (P ≥ the threshold, n ≥ 30). */
export function withConfirmed(rows: readonly ExplorerRow[], scope: string, stored: readonly StoredClaim[], th: Thresholds): ExplorerRow[] {
  const held = new Set(stored.filter((s) => s.status === 'held').map(key));
  return rows.map((r) => {
    if (r.verdict.level === 'too-early' || !r.verdict.direction || !held.has(key({ scope, field: r.field, level: r.level, direction: r.verdict.direction }))) return r;
    const v: Verdict = verdict({ n: r.nEff, pPositive: r.pBetter, lo80: r.diff - 1.2816 * r.diffSd, hi80: r.diff + 1.2816 * r.diffSd, heldOutOfSample: true }, th);
    return v.level === 'confirmed' ? { ...r, verdict: v } : r;
  });
}

export interface Brier { n: number; score: number | null; baseline: number | null }
/** Stored win probabilities against what happened (wins 1, losses 0; breakevens left out). */
export function brier(preds: ReadonlyArray<{ trade_id: string; p_win: number | null }>, trades: readonly Trade[]): Brier {
  const byId = new Map(trades.map((t) => [t.id, t]));
  const pairs = preds.flatMap((p) => {
    const t = byId.get(p.trade_id); if (!t || p.p_win == null || t.r_multiple == null) return [];
    const c = resultClass(t.r_multiple); return c === 'BE' ? [] : [{ p: p.p_win, o: c === 'W' ? 1 : 0 }];
  });
  if (!pairs.length) return { n: 0, score: null, baseline: null };
  const base = pairs.reduce((a, x) => a + x.o, 0) / pairs.length;
  return { n: pairs.length, score: pairs.reduce((a, x) => a + (x.p - x.o) ** 2, 0) / pairs.length, baseline: pairs.reduce((a, x) => a + (base - x.o) ** 2, 0) / pairs.length };
}
