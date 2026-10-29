/**
 * Economic news from a calendar file: a ForexFactory-style CSV export, or
 * any .ics calendar. Pure. Times land on the journal clock, like trades.
 * A row it cannot read is reported and skipped, never guessed.
 */
import { parseCsv, toJournalClock, type SourceZone } from './executions';

export type Impact = 'High' | 'Medium' | 'Low' | 'Holiday';
export const IMPACTS: readonly Impact[] = ['High', 'Medium', 'Low', 'Holiday'];

export interface NewsEvent { at: string; all_day: boolean; currency: string; title: string; impact: Impact }
export interface StoredNews extends NewsEvent { id: string; source: string; created_at: string }

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];
const pad = (n: number) => String(n).padStart(2, '0');

export function impactOf(text: string): Impact | null {
  const s = text.toLowerCase();
  if (/\bholiday|\bbank hol/.test(s)) return 'Holiday';
  if (/\bhigh\b|\bred\b|🔴|★★★/.test(s)) return 'High';
  if (/\bmedium\b|\bmed\b|\borange\b|🟠|★★/.test(s)) return 'Medium';
  if (/\blow\b|\byellow\b|🟡|★/.test(s)) return 'Low';
  return null;
}

/** "10-28-2026", "2026-10-28", "10/28/2026", "Oct 28, 2026" → YYYY-MM-DD. */
export function dayOf(raw: string): string | null {
  const t = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(t);
  if (m) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  const d = Date.parse(`${t} 12:00 UTC`);
  return Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
}

/** "8:30am", "08:30", "14:00", "All Day", "Tentative" → "HH:mm" or null (all day). */
export function timeOf(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = +m[1];
  if (m[3]) { const pm = m[3].toLowerCase() === 'pm'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return h < 24 && +m[2] < 60 ? `${pad(h)}:${m[2]}` : null;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/** A ForexFactory-style CSV (Title, Country/Currency, Date, Time, Impact). */
export function parseNewsCsv(text: string, zone: SourceZone): { events: NewsEvent[]; skipped: number } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { events: [], skipped: 0 };
  const h = rows[0].map(norm);
  const col = (...names: string[]) => names.map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
  const ti = col('title', 'event', 'name'); const ci = col('country', 'currency', 'ccy');
  const di = col('date', 'day'); const hi = col('time'); const ii = col('impact', 'importance', 'volatility');
  if (ti < 0 || di < 0) return { events: [], skipped: rows.length - 1 };
  const events: NewsEvent[] = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const day = dayOf(r[di] ?? '');
    const title = (r[ti] ?? '').trim();
    if (!day || !title) { skipped += 1; continue; }
    const time = hi >= 0 ? timeOf(r[hi] ?? '') : null;
    const impact = (ii >= 0 ? impactOf(r[ii] ?? '') : null) ?? 'High';
    const currency = ((ci >= 0 ? r[ci] : '') ?? '').trim().toUpperCase().slice(0, 3) || 'USD';
    const at = time ? toJournalClock(`${day} ${time}:00`, zone)?.slice(0, 16) : `${day}T00:00`;
    if (!at) { skipped += 1; continue; }
    events.push({ at, all_day: !time, currency, title: title.slice(0, 160), impact });
  }
  return { events, skipped };
}

/** An .ics calendar: every VEVENT, with its zone (TZID or Z) honoured. */
export function parseIcs(text: string, fallback: SourceZone): { events: NewsEvent[]; skipped: number } {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: NewsEvent[] = []; let skipped = 0;
  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur) {
        const ev = icsEvent(cur, fallback);
        if (ev) events.push(ev); else skipped += 1;
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (m && !cur[m[1]]) cur[m[1]] = { params: m[2], value: m[3].replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\\;/g, ';') };
  }
  return { events, skipped };
}

function icsEvent(p: Record<string, { params: string; value: string }>, fallback: SourceZone): NewsEvent | null {
  const start = p.DTSTART; const summary = p.SUMMARY?.value?.trim();
  if (!start || !summary) return null;
  const v = start.value;
  const allDay = /VALUE=DATE(?!-)/.test(start.params) || /^\d{8}$/.test(v);
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  let at: string | null;
  if (allDay || !m[4]) at = `${day}T00:00`;
  else {
    const tz = /TZID=([^;:]+)/.exec(start.params)?.[1];
    const wall = `${day} ${m[4]}:${m[5]}:${m[6] ?? '00'}${m[7] ? 'Z' : ''}`;
    let zone: SourceZone = fallback;
    if (tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); zone = tz as SourceZone; } catch { /* unknown zone: the fallback */ } }
    at = toJournalClock(m[7] ? `${day}T${m[4]}:${m[5]}:${m[6] ?? '00'}Z` : wall, zone)?.slice(0, 16) ?? null;
  }
  if (!at) return null;
  const blob = `${summary} ${p.DESCRIPTION?.value ?? ''} ${p.CATEGORIES?.value ?? ''}`;
  const currency = CURRENCIES.find((c) => new RegExp(`\\b${c}\\b`).test(blob)) ?? 'USD';
  const title = summary.replace(/^[^\w]*\b(USD|EUR|GBP|JPY|CAD|AUD|NZD|CHF|CNY)\b\s*[-–:]\s*/, '').slice(0, 160);
  return { at, all_day: allDay, currency, title, impact: impactOf(blob) ?? (allDay ? 'Holiday' : 'High') };
}

/** Either format, by its first line. */
export function parseNewsFile(text: string, zone: SourceZone): { events: NewsEvent[]; skipped: number; format: 'ics' | 'csv' } {
  return /BEGIN:VCALENDAR/.test(text.slice(0, 2000)) ? { ...parseIcs(text, zone), format: 'ics' } : { ...parseNewsCsv(text, zone), format: 'csv' };
}

/** The days that are red-folder days from the events: a high-impact event in a counted currency. */
export function redDays(events: readonly Pick<NewsEvent, 'at' | 'currency' | 'impact'>[], currencies: readonly string[]): Set<string> {
  const want = new Set(currencies.map((c) => c.toUpperCase()));
  return new Set(events.filter((e) => e.impact === 'High' && want.has(e.currency.toUpperCase())).map((e) => e.at.slice(0, 10)));
}
