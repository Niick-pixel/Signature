/**
 * Flashcards from your own trades, with spaced repetition (a small SM-2,
 * the scheduler Anki grew from). Each card is a trade: the chart and the
 * setup on the front, what happened and your lesson on the back. You say how
 * well you remembered it; the card comes back sooner or later.
 *
 *   Again  forgot it        → tomorrow, ease −0.2, a lapse
 *   Hard   remembered, slow → interval × 1.2, ease −0.15
 *   Good   remembered       → interval × ease
 *   Easy   instantly        → interval × ease × 1.3, ease +0.15
 *
 * First steps for a new card: Good → 1 day, then 3; Easy → 4 days. Ease stays
 * between 1.3 and 3.0. Pure — db/flashcards stores the cards.
 */

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export const RATINGS: ReadonlyArray<{ id: Rating; label: string; hint: string }> = [
  { id: 'again', label: 'Again', hint: 'Forgot it — tomorrow' },
  { id: 'hard', label: 'Hard', hint: 'Remembered, slowly' },
  { id: 'good', label: 'Good', hint: 'Remembered' },
  { id: 'easy', label: 'Easy', hint: 'Knew it at once' },
];

export interface CardState { interval: number; ease: number; reps: number; lapses: number; due: string }
export const NEW_CARD: Omit<CardState, 'due'> = { interval: 0, ease: 2.5, reps: 0, lapses: 0 };

const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const clampEase = (e: number) => Math.round(Math.min(3, Math.max(1.3, e)) * 100) / 100;

/** The card after one review on `today`. */
export function schedule(c: Omit<CardState, 'due'>, rating: Rating, today: string): CardState {
  let { interval, ease, reps, lapses } = c;
  if (rating === 'again') {
    lapses += 1; reps = 0; interval = 1; ease = clampEase(ease - 0.2);
  } else if (reps === 0) {
    interval = rating === 'easy' ? 4 : 1; reps = 1;
    if (rating === 'easy') ease = clampEase(ease + 0.15);
    if (rating === 'hard') ease = clampEase(ease - 0.15);
  } else if (reps === 1 && rating !== 'easy') {
    interval = rating === 'hard' ? 2 : 3; reps = 2;
    if (rating === 'hard') ease = clampEase(ease - 0.15);
  } else {
    const base = Math.max(1, interval);
    if (rating === 'hard') { interval = Math.max(base + 1, Math.round(base * 1.2)); ease = clampEase(ease - 0.15); }
    if (rating === 'good') interval = Math.max(base + 1, Math.round(base * ease));
    if (rating === 'easy') { interval = Math.max(base + 2, Math.round(base * ease * 1.3)); ease = clampEase(ease + 0.15); }
    reps += 1;
  }
  interval = Math.min(interval, 365);
  return { interval, ease, reps, lapses, due: addDays(today, interval) };
}

/** What the next review would give for each answer — shown under the buttons ("3d"). */
export function preview(c: Omit<CardState, 'due'>, today: string): Record<Rating, number> {
  return Object.fromEntries(RATINGS.map((r) => [r.id, schedule(c, r.id, today).interval])) as Record<Rating, number>;
}

export const intervalLabel = (days: number) => (days < 30 ? `${days}d` : days < 365 ? `${Math.round(days / 30)}mo` : `${Math.round(days / 365)}y`);

/** A trade that makes a card: it has a lesson worth remembering and a chart to look at. */
export const cardable = (t: { lesson: string | null; screenshot_path: string | null; deleted_at: string | null }) =>
  !t.deleted_at && Boolean(t.screenshot_path) && (t.lesson?.trim().length ?? 0) >= 12;

export interface Queue<T> { due: T[]; fresh: T[] }

/**
 * Today's queue: cards due (oldest first), then new cards up to `newPerDay`
 * minus those already introduced today. A card for the leak you are working
 * on (focusIds) is shown first among the new ones.
 */
export function todaysQueue<T extends { trade_id: string; due: string | null; introduced: string | null }>(
  cards: readonly T[], today: string, newPerDay: number, focusIds: ReadonlySet<string> = new Set(),
): Queue<T> {
  const due = cards.filter((c) => c.due != null && c.due <= today).sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0));
  const introducedToday = cards.filter((c) => c.introduced === today).length;
  const room = Math.max(0, newPerDay - introducedToday);
  const fresh = cards.filter((c) => c.due == null)
    .sort((a, b) => Number(focusIds.has(b.trade_id)) - Number(focusIds.has(a.trade_id)))
    .slice(0, room);
  return { due, fresh };
}
