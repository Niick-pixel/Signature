import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { FF_FEED_URL, parseFfFeed, redDays, type NewsEvent, type StoredNews } from '../lib/news';
import { TRADER_UTC_OFFSET_HOURS } from '../lib/planMatch';

/** News events and the two settings that decide what they mean for the rules. */
export function listNews(from?: string, to?: string): StoredNews[] {
  const db = getDb();
  const rows = from && to
    ? db.prepare('SELECT * FROM news_events WHERE at >= ? AND at <= ? ORDER BY at').all(`${from}T00:00`, `${to}T23:59`)
    : db.prepare('SELECT * FROM news_events ORDER BY at').all();
  return (rows as Record<string, unknown>[]).map((r) => ({ ...r, all_day: r.all_day === 1 }) as unknown as StoredNews);
}

/** Adds events; the same event (time, currency, title) twice is kept once. */
export function addNews(events: NewsEvent[], source: string): { added: number; already: number } {
  const put = getDb().prepare(`INSERT OR IGNORE INTO news_events (id, at, all_day, currency, title, impact, source)
    VALUES (@id, @at, @all_day, @currency, @title, @impact, @source)`);
  let added = 0;
  for (const e of events) {
    added += Number(put.run({ id: crypto.randomUUID(), at: e.at, all_day: e.all_day ? 1 : 0, currency: e.currency.toUpperCase().slice(0, 3),
      title: e.title, impact: e.impact, source }).changes);
  }
  return { added, already: events.length - added };
}

export function deleteNews(id: string): void { getDb().prepare('DELETE FROM news_events WHERE id = ?').run(id); }

export interface NewsSettings {
  currencies: string[]; marksRed: boolean;
  /** Pull ForexFactory's weekly feed on its own (at most every 6 hours). */
  ffAuto: boolean;
  /** The session the chart prep shows news for, New York time. */
  window: { from: string; to: string };
  syncedAt: string | null;
}

export function getNewsSettings(): NewsSettings {
  const get = (k: string) => (getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(k) as { value: string } | undefined)?.value;
  return {
    currencies: (get('news_currencies') ?? 'USD').split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)),
    marksRed: (get('news_marks_red') ?? '1') === '1',
    ffAuto: (get('ff_auto') ?? '1') === '1',
    window: { from: get('news_window_from') ?? '08:30', to: get('news_window_to') ?? '12:00' },
    syncedAt: get('ff_synced_at') ?? null,
  };
}

export function saveNewsSettings(s: Partial<NewsSettings>): NewsSettings {
  const put = getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (s.currencies) put.run('news_currencies', s.currencies.filter((c) => /^[A-Z]{3}$/.test(c)).join(',') || 'USD');
  if (s.marksRed != null) put.run('news_marks_red', s.marksRed ? '1' : '0');
  if (s.ffAuto != null) put.run('ff_auto', s.ffAuto ? '1' : '0');
  if (s.window && /^\d{1,2}:\d{2}$/.test(s.window.from) && /^\d{1,2}:\d{2}$/.test(s.window.to)) {
    put.run('news_window_from', s.window.from); put.run('news_window_to', s.window.to);
  }
  return getNewsSettings();
}

/** The red-folder days the news calendar says, when it is allowed to say so. */
export function newsRedDays(): Set<string> {
  const s = getNewsSettings();
  return s.marksRed ? redDays(listNews(), s.currencies) : new Set();
}

export function exportNews() { return { news_events: listNews().map((e) => ({ ...e })) }; }

export function restoreNews(body: { news_events?: unknown }): number {
  if (!Array.isArray(body.news_events)) return 0;
  const put = getDb().prepare(`INSERT OR IGNORE INTO news_events (id, at, all_day, currency, title, impact, source, created_at)
    VALUES (@id, @at, @all_day, @currency, @title, @impact, @source, @created_at)`);
  let n = 0;
  for (const r of body.news_events as Record<string, unknown>[]) {
    if (!r || typeof r.id !== 'string' || typeof r.at !== 'string' || typeof r.title !== 'string') continue;
    try {
      n += Number(put.run({ id: r.id, at: r.at, all_day: r.all_day ? 1 : 0, currency: String(r.currency ?? 'USD'), title: r.title,
        impact: ['High', 'Medium', 'Low', 'Holiday'].includes(String(r.impact)) ? String(r.impact) : 'High', source: String(r.source ?? 'manual'),
        created_at: typeof r.created_at === 'string' ? r.created_at : new Date().toISOString() }).changes);
    } catch { /* skipped */ }
  }
  return n;
}

/**
 * Pulls ForexFactory's weekly calendar feed into the news table. At most
 * every 6 hours unless forced; a failure (offline, the feed down) is
 * reported and changes nothing.
 */
export async function syncForexFactory(force = false, fetcher: typeof fetch = fetch): Promise<{ added: number; already: number; syncedAt: string | null; error?: string; skipped?: boolean }> {
  const s = getNewsSettings();
  if (!force && s.syncedAt && Date.now() - Date.parse(s.syncedAt) < 6 * 3600_000) return { added: 0, already: 0, syncedAt: s.syncedAt, skipped: true };
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10_000);
    const r = await fetcher(FF_FEED_URL, { signal: ctl.signal, headers: { 'User-Agent': 'Signature trading journal (personal, local)' } });
    clearTimeout(t);
    if (!r.ok) return { added: 0, already: 0, syncedAt: s.syncedAt, error: `ForexFactory answered ${r.status}.` };
    const { events } = parseFfFeed(await r.text(), TRADER_UTC_OFFSET_HOURS);
    if (!events.length) return { added: 0, already: 0, syncedAt: s.syncedAt, error: 'The feed was empty.' };
    const res = addNews(events, 'forexfactory');
    const now = new Date().toISOString();
    getDb().prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('ff_synced_at', now);
    return { ...res, syncedAt: now };
  } catch {
    return { added: 0, already: 0, syncedAt: s.syncedAt, error: 'Could not reach ForexFactory — offline, or the feed is down. Nothing changed.' };
  }
}
