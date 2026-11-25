/**
 * Every time on screen is the trader's own clock.
 *
 * The market's rules stay in New York time underneath — the open is 9:30 there, the killzone, the
 * cutoffs and the red folders move with US daylight saving — but nothing is shown that way: a New
 * York time is turned into the computer's local time for that very date before it is drawn
 * (lib/traderZone, so the tests can pin the offset). Pure and client-safe.
 */
import { utcToWall } from './traderZone';

const NY_PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** New York's offset from UTC, in minutes, at this instant (−300 in winter, −240 in summer). */
function nyOffsetAt(utcMs: number): number {
  const p = Object.fromEntries(NY_PARTS.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
  return Math.round((asUtc - utcMs) / 60_000);
}

/** The trader's local day today, YYYY-MM-DD (the day a New York time is read on when none is given). */
const todayLocal = () => utcToWall(Date.now()).toISOString().slice(0, 10);

/** A New York wall time on a day as a UTC instant. */
export function nyToUtc(day: string, nyMinutes: number): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0) + nyMinutes * 60_000;
  let utc = guess - nyOffsetAt(guess) * 60_000;
  utc = guess - nyOffsetAt(utc) * 60_000;
  return utc;
}

/** Minutes past midnight on the trader's clock for a New York time (it can fall on the day before or after). */
export function nyMinToLocalMin(nyMinutes: number, day: string = todayLocal()): number {
  const w = utcToWall(nyToUtc(day, nyMinutes));
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "HH:MM" on the trader's clock for minutes past midnight. */
export const hhmmOf = (mins: number) => `${pad(Math.floor((((mins % 1440) + 1440) % 1440) / 60))}:${pad((((mins % 1440) + 1440) % 1440) % 60)}`;

/** A New York time ("9:30", "09:30", or minutes past midnight) as "HH:MM" on the trader's clock that day. */
export function nyToLocal(ny: string | number, day?: string): string {
  const mins = typeof ny === 'number' ? ny : (() => { const m = /^(\d{1,2}):(\d{2})$/.exec(ny.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; })();
  if (!Number.isFinite(mins)) return String(ny);
  return hhmmOf(nyMinToLocalMin(mins, day));
}

/**
 * A label written in New York time, read on the trader's clock: every "H:MM" (and "6pm"-style hour)
 * becomes local, and "ET", "NY" or "New York" after a time goes. "Data at 8:30 ET" → "Data at 07:30".
 */
export function localizeNy(text: string, day?: string): string {
  return text
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b(\s*(?:ET|NY|New York(?: time)?))?/gi, (_m, h: string, mm: string | undefined, ap: string) => {
      const hour = (Number(h) % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0);
      return nyToLocal(hour * 60 + Number(mm ?? 0), day);
    })
    .replace(/\b(\d{1,2}):(\d{2})\b(\s*(?:ET|NY|New York(?: time)?)\b)?/g, (_m, h: string, mm: string) => nyToLocal(Number(h) * 60 + Number(mm), day));
}

/** The cash open (9:30 New York) on the trader's clock that day, "HH:MM". */
export const localOpen = (day?: string) => nyToLocal(570, day);

/** The other way: a local "HH:MM" (the trader's clock) as the New York "HH:MM" it is that day — for a setting kept in New York time. */
export function localToNy(local: string, day?: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(local.trim());
  if (!m) return local;
  // The gap between the two clocks at midday that day (the same all day, bar a clock change at night).
  const gap = ((nyMinToLocalMin(720, day) - 720) % 1440 + 1440) % 1440;
  return hhmmOf(Number(m[1]) * 60 + Number(m[2]) - gap);
}
