/**
 * Mistake ledger v2 (Edge Engine §6 L). Diagnosis, not prediction — these are
 * written after the outcome, so they say what went wrong, never what wins.
 *
 *  - each mistake theme (lib/insights THEMES: your tags and your words, with
 *    negation handled): how often, the shrunk cost per occurrence with its
 *    80% range, the total, a trend (occurrences per slice of trades, oldest
 *    to newest), the last time
 *  - a lesson not yet learned: the same theme written in 3 or more lessons
 *    within 30 trades, the dated quotes side by side
 *  - a contradiction: "entered too early" and "entered too late" both inside
 *    the last 30 trades — the entry trigger is not defined objectively
 *  - rule breaks found by the rule book (auto) against ones you ticked (self)
 *  - each loss with its tags, breaks and lesson
 */
import { compare, type Comparison } from './compare';
import { THEMES, themeSentences, themesOf, sentences } from '../insights';
import type { Trade } from '../types';
import type { Thresholds } from './verdict';

type Break = { id: string; short: string; source?: 'auto' | 'self' };
export interface ThemeCost { id: string; title: string; rule: string; n: number; cmp: Comparison | null; totalR: number; trend: number[]; last: string | null; tradeIds: string[] }
export interface Repeated { id: string; title: string; rule: string; quotes: Array<{ id: string; date: string; text: string }> }
export interface Contradiction { a: string; b: string; quotesA: Array<{ id: string; date: string; text: string }>; quotesB: Array<{ id: string; date: string; text: string }> }
export interface RuleCount { id: string; short: string; auto: number; self: number; cmp: Comparison | null }
export interface LossRow { id: string; date: string; label: string; r: number; tags: string[]; breaks: Array<{ short: string; source: 'auto' | 'self' }>; lesson: string | null; themes: string[] }
export interface LedgerV2 { themes: ThemeCost[]; repeated: Repeated[]; contradictions: Contradiction[]; rules: RuleCount[]; losses: LossRow[] }

export const REPEAT_MIN = 3; export const REPEAT_WINDOW = 30; export const TREND_SLICES = 6;
/** Pairs of themes that cannot both be the fix. */
export const CONTRADICTIONS: Array<[string, string, string]> = [['early', 'late', 'Your entry trigger is not defined objectively: you write both “too early” and “too late”.']];

const dayOf = (t: Trade) => (t.undated || !t.date ? (t.session_index ? `Session ${t.session_index}` : '') : t.date.slice(0, 10));

export function ledgerV2(trades: readonly Trade[], breaks: (t: Trade) => Break[], opts: { thresholds?: Thresholds } = {}): LedgerV2 {
  const n = trades.length;
  const rs = trades.map((t) => t.r_multiple as number);
  const th = trades.map((t) => themesOf(t));
  const slice = Math.max(1, Math.ceil(n / TREND_SLICES));
  const themes: ThemeCost[] = THEMES.map((d) => {
    const idx = trades.map((_, i) => i).filter((i) => th[i].includes(d.id));
    const set = new Set(idx);
    const trend = Array.from({ length: Math.ceil(n / slice) }, (_, s) => idx.filter((i) => Math.floor(i / slice) === s).length);
    const cmp = compare(idx.map((i) => rs[i]), rs.filter((_, i) => !set.has(i)), { thresholds: opts.thresholds, total: n });
    return { id: d.id, title: d.title, rule: d.rule, n: idx.length, cmp, totalR: cmp ? cmp.diff * idx.length : 0, trend, last: idx.length ? dayOf(trades[idx[idx.length - 1]]) : null, tradeIds: idx.map((i) => trades[i].id).reverse() };
  }).filter((x) => x.n > 0).sort((a, b) => a.totalR - b.totalR);

  // Lessons only: what you told yourself to do next time.
  const lessonQuotes = (id: string, from: number) => trades.slice(from).flatMap((t) => themeSentences(t, id).filter((s) => s.from === 'lesson').slice(0, 1).map((s) => ({ id: t.id, date: dayOf(t), text: s.text })));
  const windowFrom = Math.max(0, n - REPEAT_WINDOW);
  // Most-repeated first; one quote per trade.
  const repeated: Repeated[] = THEMES.map((d) => ({ id: d.id, title: d.title, rule: d.rule, quotes: lessonQuotes(d.id, windowFrom) }))
    .filter((x) => x.quotes.length >= REPEAT_MIN).sort((a, b) => b.quotes.length - a.quotes.length);
  // A sentence that says both ("waited for confirmation, entered late") is not a contradiction with itself.
  const contradictions: Contradiction[] = CONTRADICTIONS.map(([a, b]) => {
    const qa = lessonQuotes(a, windowFrom); const qb = lessonQuotes(b, windowFrom);
    const both = new Set(qa.filter((x) => qb.some((y) => y.id === x.id)).map((x) => x.id));
    return { a, b, quotesA: qa.filter((x) => !both.has(x.id)).slice(-3), quotesB: qb.filter((x) => !both.has(x.id)).slice(-3) };
  }).filter((c) => c.quotesA.length && c.quotesB.length);

  const br = trades.map((t) => breaks(t));
  const ids = new Map<string, string>();
  br.flat().forEach((b) => ids.set(b.id, b.short));
  const rules: RuleCount[] = [...ids].map(([id, short]) => {
    const idx = trades.map((_, i) => i).filter((i) => br[i].some((b) => b.id === id));
    const set = new Set(idx);
    return {
      id, short, auto: idx.filter((i) => br[i].some((b) => b.id === id && (b.source ?? 'auto') === 'auto')).length,
      self: idx.filter((i) => br[i].some((b) => b.id === id && b.source === 'self')).length,
      cmp: compare(idx.map((i) => rs[i]), rs.filter((_, i) => !set.has(i)), { thresholds: opts.thresholds, total: n }),
    };
  }).sort((a, b) => b.auto + b.self - (a.auto + a.self));

  const losses: LossRow[] = trades.map((t, i) => ({ t, i })).filter(({ i }) => rs[i] < -0.1).reverse().map(({ t, i }) => ({
    id: t.id, date: dayOf(t), label: `${t.setup_type} ${t.direction === 'Long' ? '↗' : '↘'}`, r: rs[i],
    tags: (t.mistake_tags ?? []) as string[], breaks: br[i].map((b) => ({ short: b.short, source: b.source ?? 'auto' })),
    lesson: (t.lesson ?? '').trim() ? sentences(t.lesson!, false)[0] ?? null : null,
    themes: THEMES.filter((d) => th[i].includes(d.id)).map((d) => d.title),
  }));
  return { themes, repeated, contradictions, rules, losses };
}
