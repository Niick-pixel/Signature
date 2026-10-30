/**
 * The Stats page in plain words: the handful of things worth acting on,
 * built from what the engine already computed. Each point is one headline,
 * one sentence, and the number behind it — no new statistics here.
 */
import type { EdgeMetrics } from './metrics';
import type { Focus } from './focus';
import type { Comparison } from './compare';
import type { Cone } from './montecarlo';
import type { Maturity } from './maturity';

export type Tone = 'good' | 'watch' | 'bad' | 'neutral';
export interface KeyPoint {
  id: 'edge' | 'fix' | 'keep' | 'rules' | 'risk' | 'next';
  title: string; headline: string; body: string; tone: Tone;
  /** For the small visual: a value on a scale, a share, or a marker against a range. */
  meter?: { kind: 'gauge'; value: number; lo: number; hi: number; min: number; max: number } | { kind: 'share'; value: number } | { kind: 'range'; value: number; p50: number; p05: number };
  href?: string;
}
export interface Summary { line: string; points: KeyPoint[] }

const R = (v: number | null | undefined, dp = 2) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(dp)}R`);
/** An amount with no sign — the words around it say which way. */
const A = (v: number) => `${Math.abs(v).toFixed(2)}R`;
const P = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export function summarize(i: {
  m: EdgeMetrics; focus: Focus; split: Comparison | null; adherence: { kept: number; n: number; rate: number | null };
  cone: Cone | null; mat: Maturity; missingCore: string[];
}): Summary {
  const { m, focus, split, adherence, cone, mat } = i;
  const ci = m.expectancyCI; const p = ci?.pPositive ?? null; const e = m.expectancy;
  const points: KeyPoint[] = [];

  // 1. Is the edge real?
  const edgeTone: Tone = e == null ? 'neutral' : e > 0 && (p ?? 0) >= 0.9 ? 'good' : e > 0 ? 'watch' : 'bad';
  const more = m.tradesFor95 != null ? Math.max(0, m.tradesFor95 - m.n) : null;
  points.push({
    id: 'edge', title: 'Your edge', tone: edgeTone,
    headline: e == null ? 'No settled trades yet' : edgeTone === 'good' ? 'Your edge looks real' : edgeTone === 'watch' ? 'Leaning positive — not proven yet' : 'Not profitable yet',
    body: e == null ? 'Log a few settled trades and this fills in.'
      : `You ${e >= 0 ? 'make' : 'lose'} ${A(e)} per trade on average over ${m.n} trades — a ${P(p)} chance the edge is above zero. You win ${P(m.winRate)}; at your average win and loss you need ${P(m.breakevenWinRate)}.${e > 0 && more ? ` About ${more} more trades at this rate to be 95% sure.` : ''}`,
    meter: ci ? { kind: 'gauge', value: ci.mean, lo: ci.lo80, hi: ci.hi80, min: Math.min(-1, ci.lo95), max: Math.max(1, ci.hi95) } : undefined,
  });

  // 2. The one thing to fix.
  const leak = focus.leak;
  points.push(leak ? {
    id: 'fix', title: 'Fix first', tone: focus.leakClear ? 'bad' : 'watch',
    headline: leak.label.replace(/^Broke: /, 'Breaking “') + (leak.label.startsWith('Broke: ') ? '”' : ''),
    body: `${focus.leakClear ? 'It costs' : 'It may cost'} about ${A(leak.cmp.diff)} each time (${leak.n} trade${leak.n === 1 ? '' : 's'}, ${leak.recent} of your last 20).${leak.experiment ? ` Try: ${leak.experiment}` : ''}${focus.leakClear ? '' : ' Not proven yet — your best candidate.'}`,
    href: '#focus',
  } : { id: 'fix', title: 'Fix first', tone: 'neutral', headline: 'Nothing stands out yet', body: 'No mistake, rule break or habit costs you clearly more than the rest. Keep logging.' });

  // 3. Keep doing.
  const s = focus.strength;
  points.push(s ? {
    id: 'keep', title: 'Keep doing', tone: 'good', headline: s.label,
    body: `Trades with it did ${A(s.cmp.diff)} better each (${s.n} trade${s.n === 1 ? '' : 's'}).${s.cmp.verdict.level === 'too-early' ? ' Early — but worth protecting.' : ''}`,
  } : { id: 'keep', title: 'Keep doing', tone: 'neutral', headline: 'Nothing proven yet', body: 'As your trades add up, the habit that pays most shows up here.' });

  // 4. Rules.
  const rate = adherence.rate;
  points.push({
    id: 'rules', title: 'Following your rules', tone: rate == null ? 'neutral' : rate >= 0.85 ? 'good' : rate >= 0.6 ? 'watch' : 'bad',
    headline: rate == null ? '—' : `${P(rate)} of trades inside every rule`,
    body: !split ? `${adherence.kept} of ${adherence.n} trades broke nothing.`
      : `${adherence.kept} of ${adherence.n}. Inside the rules ${R(split.shrunk)} a trade, breaking them ${R(split.restShrunk)}${split.verdict.level === 'too-early' ? ' — too early to say the rules pay, but they are the plan.' : split.diff > 0 ? ' — following them pays.' : '.'}`,
    meter: rate == null ? undefined : { kind: 'share', value: rate },
  });

  // 5. Risk.
  points.push(cone ? {
    id: 'risk', title: 'Risk', tone: cone.ddPercentile >= 0.1 ? 'good' : 'bad',
    headline: cone.ddPercentile >= 0.1 ? 'Your drawdown is normal for your results' : 'Your drawdown is deeper than normal',
    body: `Worst drawdown ${R(m.maxDrawdownR, 1)} (expected about ${R(cone.maxDD.p50, 1)}); longest losing run ${m.longestLosingStreak} (expected ${Math.round(cone.streak.p50)}).${cone.ddPercentile >= 0.1 ? ' Losing streaks like yours are part of your numbers.' : ' Worse than 90% of reshuffles of your own trades — check what changed.'}`,
    meter: { kind: 'range', value: m.maxDrawdownR, p50: cone.maxDD.p50, p05: cone.maxDD.p05 },
  } : { id: 'risk', title: 'Risk', tone: 'neutral', headline: 'Needs 10 trades', body: 'From 10 trades, your drawdown is compared with 10,000 reshuffles of your own results.' });

  // 6. What to log next.
  points.push({
    id: 'next', title: 'Next', tone: 'neutral',
    headline: mat.toNext != null ? `${mat.toNext} more trades to unlock more` : 'Everything is unlocked',
    body: `${i.missingCore.length ? `Log ${i.missingCore.slice(0, 3).join(', ')} on new trades (Setup detail) — the engine can't use what isn't recorded. ` : ''}${mat.nextUnlocks ? `Next: ${mat.nextUnlocks.toLowerCase()}.` : ''}`,
    meter: { kind: 'share', value: mat.progress },
  });

  const lead = edgeTone === 'good' ? 'Your edge looks real' : edgeTone === 'watch' ? 'You are slightly positive but it is not proven' : e == null ? 'Nothing to measure yet' : 'You are not profitable yet';
  const fix = leak ? `; fix first: ${points[1].headline.toLowerCase()}` : '';
  const need = e != null && e > 0 && more ? `; about ${more} more trades to be sure` : mat.toNext != null ? `; ${mat.toNext} more trades unlock the next tier` : '';
  return { line: `${lead}${fix}${need}.`, points };
}
