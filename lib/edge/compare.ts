/**
 * One honest comparison: trades with something against trades without it.
 * Both sides shrunk toward the overall mean (lib/edge/shrink, k = 20 with two
 * groups), the difference with its SD, P(difference > 0), and the verdict —
 * under 30 trades (tier 0) only an extreme gap speaks, as in the explorer.
 */
import { normCdf, Z80 } from './dist';
import { TIER1 } from './explorer';
import { resultClass } from './metrics';
import { shrinkGroups } from './shrink';
import { DEFAULT_THRESHOLDS, verdict, type Thresholds, type Verdict } from './verdict';

export interface Comparison {
  n: number; restN: number; rawMean: number | null;
  shrunk: number; restShrunk: number;
  diff: number; diffSd: number; lo80: number; hi80: number;
  /** P(with − without > 0). */
  pBetter: number;
  verdict: Verdict;
}

const group = (key: string, x: number[]) => ({ key, x, w: x.map(() => 1), wins: x.filter((r) => resultClass(r) === 'W').length, losses: x.filter((r) => resultClass(r) === 'L').length });

export function compare(withIt: readonly number[], without: readonly number[], opts: { thresholds?: Thresholds; total?: number } = {}): Comparison | null {
  if (!withIt.length || !without.length) return null;
  const sh = shrinkGroups([group('a', [...withIt]), group('b', [...without])]);
  const [a, b] = sh.groups;
  const diff = a.shrunk - b.shrunk; const diffSd = Math.sqrt(a.sd ** 2 + b.sd ** 2);
  const pBetter = diffSd > 0 ? normCdf(diff / diffSd) : 0.5;
  const lo80 = diff - Z80 * diffSd; const hi80 = diff + Z80 * diffSd;
  let v = verdict({ n: Math.min(withIt.length, without.length), pPositive: pBetter, lo80, hi80 }, opts.thresholds ?? DEFAULT_THRESHOLDS);
  const total = opts.total ?? withIt.length + without.length;
  if (total < TIER1 && !(v.p >= 0.99 && Math.abs(diff) >= 0.5)) v = { ...v, level: 'too-early', direction: null };
  return { n: withIt.length, restN: without.length, rawMean: a.rawMean, shrunk: a.shrunk, restShrunk: b.shrunk, diff, diffSd, lo80, hi80, pBetter, verdict: v };
}
