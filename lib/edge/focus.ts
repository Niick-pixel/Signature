/**
 * "One thing to fix this week" (Edge Engine §5.16). Only what you control is
 * ranked — mistake themes, rule breaks, the state you traded in, the entry
 * method — by
 *
 *   priority = P(the cost is real) × |shrunk cost per occurrence| × recent frequency
 *
 * where the cost is the shrunk mean R of trades with it minus those without
 * (lib/edge/compare) and recent frequency is its share of the last 20 trades.
 * One leak, one strength to protect (never a broken rule or a mistake), one
 * experiment. If no leak reaches Hint, it says so and names the top candidate.
 */
import { compare, type Comparison } from './compare';
import { nPerGroup } from './power';
import type { TradeState } from './state';
import { THEMES, themesOf } from '../insights';
import type { Trade } from '../types';
import type { Thresholds } from './verdict';

export type FocusKind = 'rule' | 'theme' | 'state' | 'entry' | 'worked' | 'clean';
export interface FocusItem {
  kind: FocusKind; key: string; label: string;
  n: number; recent: number; cmp: Comparison; priority: number;
  /** Newest first. */
  tradeIds: string[];
  experiment: string | null;
}
export interface Focus {
  leak: FocusItem | null; leakClear: boolean;
  strength: FocusItem | null;
  experiment: { text: string; n: number; from: string } | null;
  candidates: FocusItem[];
}

export const RECENT = 20;
type Break = { id: string; short: string; source?: 'auto' | 'self' };
const st = (t: Trade) => (t as Trade & { __state?: TradeState }).__state;

const STATES: Array<{ key: string; label: string; test: (s: TradeState) => boolean; experiment: string }> = [
  { key: 'after-loss', label: 'Trading right after a loss', test: (s) => s.after === 'loss', experiment: 'Stop for the day after the first loss.' },
  { key: 'second-plus', label: 'A 2nd or later trade of the day', test: (s) => (s.tradeNo ?? 0) >= 2, experiment: 'One trade a day: done after the first, win or lose.' },
  { key: 'day-down', label: 'Trading while the day is down', test: (s) => (s.tradeNo ?? 0) >= 2 && (s.rBefore ?? 0) < -0.1, experiment: 'Once the day is red, close the chart.' },
];

export function weeklyFocus(trades: readonly Trade[], breaks: (t: Trade) => Break[], opts: { thresholds?: Thresholds; sd?: number | null } = {}): Focus {
  const n = trades.length;
  const rs = trades.map((t) => t.r_multiple as number);
  const recentIds = new Set(trades.slice(-RECENT).map((t) => t.id));
  const recentN = Math.min(RECENT, n);
  const items: FocusItem[] = [];
  const add = (kind: FocusKind, key: string, label: string, has: (t: Trade, i: number) => boolean, experiment: string | null) => {
    const idx = trades.map((t, i) => (has(t, i) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 1 || idx.length === n) return;
    const set = new Set(idx);
    const cmp = compare(idx.map((i) => rs[i]), rs.filter((_, i) => !set.has(i)), { thresholds: opts.thresholds, total: n });
    if (!cmp) return;
    const recent = idx.filter((i) => recentIds.has(trades[i].id)).length;
    items.push({ kind, key, label, n: idx.length, recent, cmp, priority: 0, tradeIds: idx.map((i) => trades[i].id).reverse(), experiment });
  };

  const br = trades.map((t) => breaks(t));
  const rules = new Map<string, string>();
  br.flat().forEach((b) => rules.set(b.id, b.short));
  for (const [id, short] of rules) add('rule', id, `Broke: ${short}`, (_, i) => br[i].some((b) => b.id === id), `Keep “${short}” on every trade.`);
  const themes = trades.map((t) => themesOf(t));
  for (const d of THEMES) add('theme', d.id, d.title, (_, i) => themes[i].includes(d.id), d.rule);
  for (const s of STATES) add('state', s.key, s.label, (t) => { const x = st(t); return x ? s.test(x) : false; }, s.experiment);
  const methods = new Set(trades.map((t) => t.entry_method).filter(Boolean) as string[]);
  for (const m of methods) add('entry', m, `Entry: ${m}`, (t) => t.entry_method === m, `No “${m}” entries.`);
  // Strengths: things that keep the plan, never a break.
  add('clean', 'no-break', 'Inside every rule', (_, i) => br[i].length === 0, null);
  const worked = new Set(trades.flatMap((t) => (t.worked_tags ?? []) as string[]));
  for (const w of worked) add('worked', w, w, (t) => ((t.worked_tags ?? []) as string[]).includes(w), null);
  add('state', 'first', 'The first trade of the day', (t) => st(t)?.tradeNo === 1, null);

  const freq = (x: FocusItem) => (recentN ? x.recent / recentN : 0);
  const leaks = items.filter((x) => x.kind !== 'clean' && x.kind !== 'worked' && x.key !== 'first' && x.cmp.diff < 0)
    .map((x) => ({ ...x, priority: (1 - x.cmp.pBetter) * Math.abs(x.cmp.diff) * freq(x) }))
    .sort((a, b) => b.priority - a.priority || a.cmp.diff - b.cmp.diff);
  const strengths = items.filter((x) => (x.kind === 'clean' || x.kind === 'worked' || x.key === 'first' || x.kind === 'entry') && x.cmp.diff > 0)
    .map((x) => ({ ...x, priority: x.cmp.pBetter * x.cmp.diff * freq(x) }))
    .sort((a, b) => b.priority - a.priority);
  const leak = leaks.find((x) => x.priority > 0) ?? leaks[0] ?? null;
  // Not the leak seen from the other side (1st trade vs 2nd-or-later is one split, not two findings).
  const mirror = (x: FocusItem) => Boolean(leak) && x.n + leak!.n === n && !x.tradeIds.some((id) => leak!.tradeIds.includes(id));
  const strength = strengths.find((x) => x.priority > 0 && !mirror(x)) ?? null;
  const sd = opts.sd ?? null;
  const experiment = leak?.experiment
    ? { text: leak.experiment, from: leak.label, n: sd ? Math.min(400, Math.max(10, nPerGroup(sd, Math.max(0.25, Math.abs(leak.cmp.diff))))) : 30 }
    : null;
  return { leak, leakClear: Boolean(leak && leak.cmp.verdict.level !== 'too-early'), strength, experiment, candidates: leaks.slice(0, 5) };
}
