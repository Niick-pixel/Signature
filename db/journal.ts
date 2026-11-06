import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './index';
import { listTrades } from './trades';
import { sanitiseHtml, toPlainText } from '../lib/sanitise';
import type { JournalPage } from '../lib/types';

function hydrate(row: Record<string, unknown>): JournalPage {
  return {
    id: String(row.id),
    day: String(row.day),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    plain: String(row.plain ?? ''),
    pinned: Boolean(row.pinned),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/*
  The weekly review's best and worst charts were written with an encoded path
  and a width (…%2F…?w=720) that the sanitiser did not accept, so the page was
  saved with each image's address dropped: <img alt="Best chart" />. Each one
  sits under its trade's line ("Best: 2026-11-05 · Backtest (FX Replay) · …
  · +3.10R"), which is enough to find the trade and its chart again. Repaired
  once, the first time the page is read; only images with no address are
  touched, never the writing around them.
*/
const BROKEN_CHART = /(<p><b>(Best|Worst):<\/b> (\d{4}-\d{2}-\d{2}) · ([^<]+?) · [^<]*?<b>([−+-]?)(\d+\.\d{2})R<\/b><\/p>\s*<p>)<img alt="(?:Best|Worst) chart" \/>/g;
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function repairWeekCharts(body: string, trades: ReadonlyArray<{ date: string; account: string; r_multiple: number | null; screenshot_path: string | null; deleted_at: string | null }>): string {
  return body.replace(BROKEN_CHART, (whole, before: string, label: string, day: string, account: string, sign: string, num: string) => {
    const r = Number(num) * (sign === '−' || sign === '-' ? -1 : 1);
    const t = trades.find((x) => !x.deleted_at && x.screenshot_path && x.date.startsWith(day) && x.account === unesc(account.trim())
      && x.r_multiple != null && Math.abs(x.r_multiple - r) < 0.006);
    return t ? `${before}<img src="/api/screenshots/${t.screenshot_path}?w=720" alt="${label} chart" />` : whole;
  });
}

function repaired(row: Record<string, unknown>): Record<string, unknown> {
  const body = String(row.body ?? '');
  if (!/<img alt="(Best|Worst) chart" \/>/.test(body)) return row;
  const fixed = repairWeekCharts(body, listTrades());
  if (fixed === body) return row;
  getDb().prepare('UPDATE journal_pages SET body = ? WHERE id = ?').run(fixed, row.id as string);
  return { ...row, body: fixed };
}

export function listJournalPages(): JournalPage[] {
  return (getDb()
    .prepare('SELECT * FROM journal_pages ORDER BY pinned DESC, day DESC, created_at DESC')
    .all() as Record<string, unknown>[]).map(repaired).map(hydrate);
}

export function getJournalPage(id: string): JournalPage | null {
  const row = getDb().prepare('SELECT * FROM journal_pages WHERE id = ?').get(id) as
    Record<string, unknown> | undefined;
  return row ? hydrate(repaired(row)) : null;
}

export interface JournalInput {
  day: string;
  title: string;
  body: string;
  pinned: boolean;
}

export function parseJournalInput(raw: unknown): { ok: true; value: JournalInput } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Malformed page.' };
  const t = raw as Record<string, unknown>;
  const day = typeof t.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.day) ? t.day : null;
  if (!day) return { ok: false, error: 'A page needs a date.' };
  /*
    Nothing is required except the date.

    The rest of this app demands 160 characters before it will record a trade,
    on purpose. A journal has to be the opposite: the entry you write in eight
    words at midnight is the one that turns out to matter, and a minimum is how
    you teach yourself not to open it.
  */
  return {
    ok: true,
    value: {
      day,
      title: typeof t.title === 'string' ? t.title.trim().slice(0, 200) : '',
      body: sanitiseHtml(typeof t.body === 'string' ? t.body : ''),
      pinned: t.pinned === true,
    },
  };
}

export function createJournalPage(input: JournalInput): JournalPage {
  const id = crypto.randomUUID();
  getDb()
    .prepare(`INSERT INTO journal_pages (id, day, title, body, plain, pinned)
              VALUES (@id, @day, @title, @body, @plain, @pinned)`)
    .run({ id, ...input, plain: toPlainText(input.body), pinned: input.pinned ? 1 : 0 });
  return getJournalPage(id)!;
}

export function updateJournalPage(id: string, input: JournalInput): JournalPage | null {
  if (!getJournalPage(id)) return null;
  getDb()
    .prepare(`UPDATE journal_pages
              SET day = @day, title = @title, body = @body, plain = @plain, pinned = @pinned
              WHERE id = @id`)
    .run({ id, ...input, plain: toPlainText(input.body), pinned: input.pinned ? 1 : 0 });
  return getJournalPage(id);
}

/** Restores under the id an export carried, so importing twice is a no-op. */
export function importJournalPage(id: string, input: JournalInput, created_at: string | null): void {
  getDb()
    .prepare(`INSERT INTO journal_pages (id, day, title, body, plain, pinned, created_at)
              VALUES (@id, @day, @title, @body, @plain, @pinned,
                      COALESCE(@created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')))`)
    .run({ id, ...input, plain: toPlainText(input.body), pinned: input.pinned ? 1 : 0, created_at });
}

export function deleteJournalPage(id: string): boolean {
  return getDb().prepare('DELETE FROM journal_pages WHERE id = ?').run(id).changes > 0;
}

/** Days that have at least one page — for the calendar's written-on marker. */
export function journalDays(): string[] {
  return (getDb().prepare('SELECT DISTINCT day FROM journal_pages').all() as { day: string }[])
    .map((r) => r.day);
}
