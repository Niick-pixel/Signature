/**
 * Smart Rotate: when the page opens, a stack that has it on shows the widget
 * that needs you, not the one you left in front. Deterministic and tested; no
 * AI. A widget raises at most one signal; the strongest wins.
 *
 * Signals, strongest first (the order is the point: something you did today
 * beats something the engine noticed, which beats bookkeeping):
 *   rule-today       a trade dated today broke a written rule
 *   new-flaw         a flaw first seen in your last 5 trades, or that happened on the latest one
 *   integrity        your data would make a number wrong (a bug outranks a warning)
 *   drill-milestone  the active drill just reached 5 / 10 / 15 clean trades, or graduated
 *
 * Score = WEIGHT[signal] + strength (0–9). Nothing above 0: the stack keeps
 * the widget you left in front. A tie goes to the one higher in the stack.
 * Rotation only chooses what is shown first; it never saves over your order.
 */

export type Signal = 'rule-today' | 'new-flaw' | 'integrity' | 'drill-milestone';
export const WEIGHT: Record<Signal, number> = { 'rule-today': 40, 'new-flaw': 30, integrity: 20, 'drill-milestone': 10 };
export interface Attention { signal: Signal; strength: number; reason: string }

export function scoreOf(a: Attention | null | undefined): number {
  if (!a) return 0;
  return WEIGHT[a.signal] + Math.max(0, Math.min(9, Math.round(a.strength)));
}

/** Which item goes in front: the highest score above 0, else the saved one. */
export function pickFront(attn: ReadonlyArray<Attention | null | undefined>, saved: number): { index: number; reason: string | null } {
  let best = -1; let bestScore = 0;
  attn.forEach((a, i) => { const s = scoreOf(a); if (s > bestScore) { best = i; bestScore = s; } });
  if (best < 0) return { index: Math.max(0, Math.min(saved, attn.length - 1)), reason: null };
  return { index: best, reason: attn[best]!.reason };
}

/* ─────────── the signals, each from the engine's own outputs ─────────── */

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Trades dated `today` (local YYYY-MM-DD) that broke at least one rule. */
export function ruleToday<T extends { id: string; date: string }>(trades: readonly T[], breaksOf: (t: T) => readonly unknown[], today: string): Attention | null {
  const broke = trades.filter((t) => t.date.slice(0, 10) === today && breaksOf(t).length > 0).length;
  return broke ? { signal: 'rule-today', strength: broke, reason: `${plural(broke, 'trade')} today broke a rule` } : null;
}

/**
 * A flaw is news when it first appeared in the last `window` settled trades,
 * or when it happened on the latest trade. `settledIds` oldest first.
 */
export function flawNews(flaw: { title: string; hits: readonly string[] } | null | undefined, settledIds: readonly string[], window = 5): Attention | null {
  if (!flaw || !flaw.hits.length || !settledIds.length) return null;
  const recent = new Set(settledIds.slice(-window));
  if (flaw.hits.every((id) => recent.has(id))) return { signal: 'new-flaw', strength: 9, reason: `New: ${flaw.title.toLowerCase()}` };
  if (flaw.hits.includes(settledIds[settledIds.length - 1])) return { signal: 'new-flaw', strength: 4, reason: `${flaw.title} again on your last trade` };
  return null;
}

/** Data issues: a bug (a number is wrong) outranks a warning; notes don't rotate. */
export function integrityNews(issues: ReadonlyArray<{ tone?: string }>): Attention | null {
  const bugs = issues.filter((i) => i.tone === 'bug').length;
  const warns = issues.filter((i) => i.tone === 'warn').length;
  if (bugs) return { signal: 'integrity', strength: 5 + Math.min(4, bugs), reason: `${plural(bugs, 'data problem')} that make a number wrong` };
  if (warns) return { signal: 'integrity', strength: Math.min(4, warns), reason: `${plural(warns, 'data warning')}` };
  return null;
}

export const MILESTONES = [5, 10, 15] as const;
/** The active drill on a round number of clean trades in a row, or graduated. */
export function drillMilestone(p: { clean: number; graduated: boolean } | null | undefined): Attention | null {
  if (!p) return null;
  if (p.graduated) return { signal: 'drill-milestone', strength: 9, reason: 'Your drill graduated' };
  if ((MILESTONES as readonly number[]).includes(p.clean)) return { signal: 'drill-milestone', strength: p.clean / 5, reason: `${p.clean} clean trades in a row on your drill` };
  return null;
}
