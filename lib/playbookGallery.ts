/**
 * Your A+ visual playbook (big update, #7): your own best-graded charts, grouped by setup and grade,
 * with the lines you drew on them — and, while grading a new one, the three past A+ charts nearest
 * to it. Pure: the server hands in the trades, which of them kept every rule, and the drawings.
 *
 * "Best" is the grade and the rules, never the result: a clean A+ that lost is still the picture of
 * the setup, and a winner that broke a rule is never in here. The compare peek shows charts only —
 * no R, no outcome — because it is shown before the decision.
 */
import { isBacktest, isHypothetical, isTaken } from './domain';
import { rubricFamily } from './decision';
import { gower } from './edge/similar';
import { effectiveGrade } from './path';
import type { DrawItem } from './drawing';
import type { Trade } from './types';

export const GALLERY_GRADES = ['A+', 'A'] as const;
export type GalleryGrade = (typeof GALLERY_GRADES)[number];

export interface GalleryItem {
  id: string; date: string; account: string; world: 'real' | 'backtest'; setup: string; direction: string;
  grade: GalleryGrade; r: number | null; outcome: string; shot: string; drawing: DrawItem[] | null;
}
export interface GalleryGroup { setup: string; items: GalleryItem[]; aplus: number }

const shotOf = (t: Trade) => (t.screenshot_path && t.screenshot_path.trim() ? t.screenshot_path : null);

/** A+ and A trades, taken, every rule kept, with a chart. Newest first. */
export function galleryTrades(trades: readonly Trade[], clean: (t: Trade) => boolean): Trade[] {
  return trades.filter((t) => !t.deleted_at && !isHypothetical(t.account) && isTaken(t.outcome) && t.status !== 'Planned'
    && shotOf(t) && (GALLERY_GRADES as readonly string[]).includes(effectiveGrade(t)) && clean(t))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function galleryGroups(trades: readonly Trade[], clean: (t: Trade) => boolean, drawings: Readonly<Record<string, { items: unknown[] }>> = {}): GalleryGroup[] {
  const by = new Map<string, GalleryItem[]>();
  for (const t of galleryTrades(trades, clean)) {
    const shot = shotOf(t) as string;
    const item: GalleryItem = { id: t.id, date: t.date.slice(0, 10), account: t.account, world: isBacktest(t.account) ? 'backtest' : 'real', setup: t.setup_type,
      direction: t.direction, grade: effectiveGrade(t) as GalleryGrade, r: t.r_multiple, outcome: t.outcome, shot, drawing: (drawings[shot]?.items as DrawItem[] | undefined) ?? null };
    by.set(t.setup_type, [...(by.get(t.setup_type) ?? []), item]);
  }
  return [...by].map(([setup, items]) => ({ setup, items, aplus: items.filter((i) => i.grade === 'A+').length }))
    .sort((a, b) => b.items.length - a.items.length);
}

/** The `k` past A+ charts nearest to a draft being graded, in its own rubric family. Charts only. */
export function compareAPlus(draft: Trade, trades: readonly Trade[], clean: (t: Trade) => boolean, k = 3): Array<{ id: string; date: string; setup: string; direction: string; shot: string; shared: number }> {
  const family = rubricFamily(draft);
  return galleryTrades(trades, clean).filter((t) => effectiveGrade(t) === 'A+' && rubricFamily(t) === family && t.id !== draft.id)
    .map((t) => ({ t, ...gower(draft, t) }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => a.d - b.d || b.t.date.localeCompare(a.t.date))
    .slice(0, k)
    .map(({ t, shared }) => ({ id: t.id, date: t.date.slice(0, 10), setup: t.setup_type, direction: t.direction, shot: shotOf(t) as string, shared }));
}
