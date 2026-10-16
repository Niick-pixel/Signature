import 'server-only';
import { getDb } from './index';
import { listTrades } from './trades';
import { createJournalPage, getJournalPage, parseJournalInput } from './journal';
import { redDays, redDayTemplate, type RedDay, type World } from '../lib/redDays';
import { isBacktest, isHypothetical, marketDay } from '../lib/domain';

const LOOKBACK_DAYS = 14;

function links(): Map<string, string | null> {
  const rows = getDb().prepare('SELECT day, world, page_id FROM red_day_pages').all() as Array<{ day: string; world: string; page_id: string | null }>;
  // A page deleted since no longer counts as written.
  return new Map(rows.map((r) => [`${r.world}|${r.day}`, r.page_id && getJournalPage(r.page_id) ? r.page_id : null]));
}

function skips(): Set<string> {
  const rows = getDb().prepare('SELECT day, world FROM red_day_skips').all() as Array<{ day: string; world: string }>;
  return new Set(rows.map((r) => `${r.world}|${r.day}`));
}

/** Red days count from here (migration 029 sets it to the day it ran). */
export function redDaysSince(): string | null {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = 'red_days_since'").get() as { value: string } | undefined;
  return row?.value ?? null;
}

export interface RedDayStatus {
  withPage: number; without: number; skipped: number;
  since: string | null;
  days: Array<RedDay & { pageId: string | null; skipped: boolean }>;
}

export function redDayStatus(): RedDayStatus {
  const l = links();
  const s = skips();
  const since = redDaysSince();
  const days = redDays(listTrades(), since).map((d) => {
    const pageId = l.get(`${d.world}|${d.day}`) ?? null;
    return { ...d, pageId, skipped: !pageId && s.has(`${d.world}|${d.day}`) };
  });
  return {
    withPage: days.filter((d) => d.pageId).length,
    without: days.filter((d) => !d.pageId && !d.skipped).length,
    skipped: days.filter((d) => d.skipped).length,
    since, days,
  };
}

/**
 * The red day to ask about on this open: the most recent one without a page
 * and not skipped, whose last trade was logged before today (the day is
 * over), within the last two weeks.
 */
export function pendingRedDay(today: string): (RedDay & { pageId: null }) | null {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const s = redDayStatus();
  const d = s.days.find((x) => !x.pageId && !x.skipped && x.lastLoggedAt >= since && new Date(x.lastLoggedAt).toLocaleDateString('en-CA') < today);
  return d ? { ...d, pageId: null } : null;
}

/** Skip a red day: it is never asked about again, and counted as skipped. */
export function skipRedDay(day: string, world: World): void {
  getDb().prepare('INSERT OR IGNORE INTO red_day_skips (day, world) VALUES (?, ?)').run(day, world);
}

/** Write the page for a red day (or return the one already written). */
export function writeRedDayPage(day: string, world: World): string | null {
  const existing = links().get(`${world}|${day}`);
  if (existing) return existing;
  const d = redDays(listTrades()).find((x) => x.day === day && x.world === world);
  if (!d) return null;
  const lines = listTrades()
    .filter((t) => marketDay(t) === day && !isHypothetical(t.account) && !isBacktest(t.account) && t.outcome !== 'Not taken')
    .map((t) => `${t.setup_type} ${t.direction} · ${t.outcome}${t.r_multiple != null ? ` ${t.r_multiple}R` : ''} · grade ${t.grade_letter}${t.mistake_tags.length ? ` · ${t.mistake_tags.join(', ')}` : ''}`);
  const parsed = parseJournalInput({ day, title: `Red day · ${day}`, body: redDayTemplate(d, lines) });
  if (!parsed.ok) return null;
  const page = createJournalPage(parsed.value);
  getDb().prepare(`INSERT INTO red_day_pages (day, world, page_id) VALUES (?, ?, ?)
                   ON CONFLICT(day, world) DO UPDATE SET page_id = excluded.page_id`).run(day, world, page.id);
  return page.id;
}
