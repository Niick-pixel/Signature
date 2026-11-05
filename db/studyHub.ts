import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { listTrades } from './trades';
import { reviewInputs } from './review';
import { listThemeWords, listBlindGrades } from './edge';
import { createNote } from './study';
import { accountLabel, isReal } from '../lib/domain';
import { dayBreaksByTrade, fieldEras, planBreaks } from '../lib/review';
import { edgeMetrics } from '../lib/edge/metrics';
import { tradeStates, withState } from '../lib/edge/state';
import { weeklyFocus } from '../lib/edge/focus';
import { allThemes, themesWith } from '../lib/edge/text';
import { blindCounter, blindSession } from '../lib/edge/blind';
import { NEW_CARD, cardable, preview, schedule, todaysQueue, type Rating } from '../lib/flashcards';
import type { Trade } from '../lib/types';

/* ───────────────────────── flashcards ───────────────────────── */

const NEW_KEY = 'study_new_per_day';
export function newPerDay(): number {
  const v = Number((getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(NEW_KEY) as { value: string } | undefined)?.value);
  return Number.isFinite(v) && v >= 0 && v <= 50 ? Math.round(v) : 10;
}
export function setNewPerDay(n: number): number {
  const v = Math.round(Math.min(50, Math.max(0, n)));
  getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(NEW_KEY, String(v));
  return v;
}

interface CardRow { trade_id: string; interval: number; ease: number; reps: number; lapses: number; due: string | null; introduced: string | null; last_review: string | null; suspended: number }

export interface Flashcard {
  tradeId: string; shot: string; setup: string; direction: string; account: string; date: string | null;
  grade: string | null; outcome: string; r: number | null; mistakes: string[]; lesson: string;
  isNew: boolean; lapses: number; next: Record<Rating, number>;
}

/** Every trade with a chart and a lesson has a card; new ones are added as trades are logged. */
function syncCards(trades: readonly Trade[]): Map<string, CardRow> {
  const db = getDb();
  const ins = db.prepare('INSERT OR IGNORE INTO study_cards (trade_id) VALUES (?)');
  for (const t of trades) if (cardable(t)) ins.run(t.id);
  const rows = (db.prepare('SELECT * FROM study_cards').all() as unknown as CardRow[]).map((r) => ({ ...r }));
  return new Map(rows.map((r) => [r.trade_id, r]));
}

/*
  last_review holds your local day (the one the review counted on) with the
  time after it: an ISO timestamp is in UTC, and in the evening west of
  Greenwich its date is already tomorrow — "reviewed today" read 0 after 6pm.
*/
const asCard = (t: Trade, c: CardRow, today: string): Flashcard => ({
  tradeId: t.id, shot: t.screenshot_path!, setup: t.setup_type, direction: t.direction, account: accountLabel(t.account),
  date: t.undated ? null : t.date.slice(0, 10), grade: t.grade_letter ?? null, outcome: t.outcome, r: t.r_multiple ?? null,
  mistakes: (t.mistake_tags ?? []) as string[], lesson: t.lesson ?? '', isNew: c.due == null, lapses: c.lapses,
  next: preview(c, today),
});

/** Today's cards (due, then new up to the daily limit, the leak's trades first) and the deck's numbers. */
export function cardQueue(today: string, focusIds: ReadonlySet<string> = new Set()) {
  const trades = listTrades().filter((t) => cardable(t));
  const byId = new Map(trades.map((t) => [t.id, t]));
  const rows = [...syncCards(trades).values()].filter((c) => byId.has(c.trade_id) && !c.suspended);
  const limit = newPerDay();
  const q = todaysQueue(rows, today, limit, focusIds);
  return {
    cards: [...q.due, ...q.fresh].map((c) => asCard(byId.get(c.trade_id)!, c, today)),
    stats: {
      deck: rows.length, due: q.due.length, fresh: q.fresh.length, newPerDay: limit,
      learned: rows.filter((c) => c.reps > 0 && c.interval >= 21).length,
      reviewedToday: rows.filter((c) => c.last_review?.slice(0, 10) === today).length,
    },
  };
}

export function reviewCard(tradeId: string, rating: Rating, today: string): { due: string; interval: number } | null {
  const db = getDb();
  const c = db.prepare('SELECT * FROM study_cards WHERE trade_id = ?').get(tradeId) as unknown as CardRow | undefined;
  if (!c) return null;
  const next = schedule(c.reps === 0 && c.due == null ? NEW_CARD : c, rating, today);
  db.prepare(`UPDATE study_cards SET interval = ?, ease = ?, reps = ?, lapses = ?, due = ?, introduced = COALESCE(introduced, ?), last_review = ?
    WHERE trade_id = ?`).run(next.interval, next.ease, next.reps, next.lapses, next.due, today, `${today}T${new Date().toISOString().slice(11, 19)}`, tradeId);
  return { due: next.due, interval: next.interval };
}

export function suspendCard(tradeId: string, on: boolean): boolean {
  return getDb().prepare('UPDATE study_cards SET suspended = ? WHERE trade_id = ?').run(on ? 1 : 0, tradeId).changes > 0;
}

/* ───────────────────── the plan: study what costs you ───────────────────── */

export interface StudyPlan {
  leak: { label: string; kind: string; clear: boolean; costR: number; n: number; recent: number; experiment: string | null; tradeIds: string[] } | null;
  examples: Array<{ id: string; setup: string; date: string | null; r: number | null; shot: string | null }>;
  trades: number;
}

/** The Edge Engine's "Fix first" leak on your real trades, turned into this week's study. */
export function studyPlan(): StudyPlan {
  const { trades: all, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(all, ctxFor, cfg);
  const eras = fieldEras(all);
  const settled = listTrades().filter((t) => !t.deleted_at && isReal(t.account) && t.outcome !== 'Not taken' && t.r_multiple != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (settled.length < 5) return { leak: null, examples: [], trades: settled.length };
  const metrics = edgeMetrics(settled.map((t) => ({ r: t.r_multiple as number, money: null })));
  const stateful = withState(settled, tradeStates(settled, ctxFor));
  const focus = weeklyFocus(stateful, (t) => planBreaks(t, breaks, cfg, eras), { sd: metrics.sd, words: listThemeWords() });
  const l = focus.leak;
  if (!l) return { leak: null, examples: [], trades: settled.length };
  const byId = new Map(settled.map((t) => [t.id, t]));
  const examples = l.tradeIds.slice(0, 6).map((id) => byId.get(id)).filter(Boolean).map((t) => ({
    id: t!.id, setup: t!.setup_type, date: t!.undated ? null : t!.date.slice(0, 10), r: t!.r_multiple ?? null, shot: t!.screenshot_path ?? null,
  }));
  return {
    leak: { label: l.label, kind: l.kind, clear: focus.leakClear, costR: Math.round(l.cmp.diff * 100) / 100, n: l.n, recent: l.recent, experiment: l.experiment, tradeIds: l.tradeIds },
    examples, trades: settled.length,
  };
}

/* ───────────────────────── the lesson library ───────────────────────── */

export interface LessonRow { tradeId: string; date: string | null; account: string; setup: string; outcome: string; r: number | null; lesson: string; themes: string[]; mistakes: string[]; shot: string | null }

/** Every lesson you have written, newest first, with the mistake themes found in it. */
export function lessonLibrary(): { lessons: LessonRow[]; themes: Array<{ id: string; title: string; n: number }> } {
  const words = listThemeWords();
  const trades = listTrades().filter((t) => !t.deleted_at && (t.lesson?.trim().length ?? 0) >= 12)
    .sort((a, b) => (b.undated ? b.created_at : b.date).localeCompare(a.undated ? a.created_at : a.date));
  const lessons = trades.map((t) => ({
    tradeId: t.id, date: t.undated ? null : t.date.slice(0, 10), account: accountLabel(t.account), setup: t.setup_type, outcome: t.outcome,
    r: t.r_multiple ?? null, lesson: t.lesson!.trim(), themes: themesWith(t, words), mistakes: (t.mistake_tags ?? []) as string[], shot: t.screenshot_path ?? null,
  }));
  const count = new Map<string, number>();
  for (const l of lessons) for (const th of l.themes) count.set(th, (count.get(th) ?? 0) + 1);
  const themes = allThemes(words).filter((d) => count.has(d.id)).map((d) => ({ id: d.id, title: d.title, n: count.get(d.id)! })).sort((a, b) => b.n - a.n);
  return { lessons, themes };
}

/* ───────────────────────── drills ───────────────────────── */

/** This week's blind re-grade set, for the Study room's Drills tab. */
export function drills(today: string) {
  const all = listTrades().filter((t) => !t.deleted_at);
  const graded = listBlindGrades();
  const pool = all.filter((t) => t.screenshot_path && t.entry_line_x != null);
  return {
    items: blindSession(pool, graded, today).map((t) => ({ id: t.id, shot: t.screenshot_path as string, x: t.entry_line_x as number })),
    pool: pool.length, counter: blindCounter(graded, today),
    needEntry: all.filter((t) => t.screenshot_path && t.entry_line_x == null).length,
  };
}

/* ───────────────────────── watch later ───────────────────────── */

export interface WatchItem { id: string; url: string; title: string; why: string; added_at: string; done_at: string | null; note_id: string | null }

export function listWatchLater(): WatchItem[] {
  return (getDb().prepare('SELECT * FROM watch_later ORDER BY done_at IS NOT NULL, added_at DESC').all() as Record<string, unknown>[]).map((r) => ({ ...r }) as unknown as WatchItem);
}
export function addWatchLater(url: string, title: string, why: string): WatchItem {
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO watch_later (id, url, title, why) VALUES (?, ?, ?, ?)').run(id, url, title, why);
  return { ...(getDb().prepare('SELECT * FROM watch_later WHERE id = ?').get(id) as Record<string, unknown>) } as unknown as WatchItem;
}
/** Start watching: a video note is made for it (timestamps go there), and it leaves the list. */
export function startWatching(id: string): { noteId: string } | null {
  const w = getDb().prepare('SELECT * FROM watch_later WHERE id = ?').get(id) as unknown as WatchItem | undefined;
  if (!w) return null;
  const noteId = w.note_id ?? createNote({ kind: 'video', title: w.title || 'Video', url: w.url, body: w.why }).id;
  getDb().prepare('UPDATE watch_later SET note_id = ?, done_at = COALESCE(done_at, ?) WHERE id = ?').run(noteId, new Date().toISOString(), id);
  return { noteId };
}
export function deleteWatchLater(id: string): void { getDb().prepare('DELETE FROM watch_later WHERE id = ?').run(id); }
