/**
 * US market holidays — days the NY session does not run, so no session
 * reminder fires. Computed, not listed, so it never runs out: New Year,
 * Martin Luther King Jr. Day, Presidents' Day, Good Friday, Memorial Day,
 * Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas — with
 * the weekend observance rules (Saturday → Friday, Sunday → Monday).
 */
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

/** The nth weekday (0 = Sunday) of a month; n = -1 for the last. */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = dow(y, m, 1);
    return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = dow(y, m, days);
  return iso(y, m, days - ((last - weekday + 7) % 7));
}

/** A fixed-date holiday moved off the weekend. */
function observed(y: number, m: number, d: number): string {
  const w = dow(y, m, d);
  if (w === 6) { const x = new Date(Date.UTC(y, m - 1, d - 1)); return x.toISOString().slice(0, 10); }
  if (w === 0) { const x = new Date(Date.UTC(y, m - 1, d + 1)); return x.toISOString().slice(0, 10); }
  return iso(y, m, d);
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(y: number): { m: number; d: number } {
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

const cache = new Map<number, Map<string, string>>();
export function marketHolidays(y: number): Map<string, string> {
  const hit = cache.get(y); if (hit) return hit;
  const e = easter(y); const gf = new Date(Date.UTC(y, e.m - 1, e.d - 2)).toISOString().slice(0, 10);
  const out = new Map<string, string>([
    [observed(y, 1, 1), 'New Year’s Day'],
    [nthWeekday(y, 1, 1, 3), 'Martin Luther King Jr. Day'],
    [nthWeekday(y, 2, 1, 3), 'Presidents’ Day'],
    [gf, 'Good Friday'],
    [nthWeekday(y, 5, 1, -1), 'Memorial Day'],
    [observed(y, 6, 19), 'Juneteenth'],
    [observed(y, 7, 4), 'Independence Day'],
    [nthWeekday(y, 9, 1, 1), 'Labor Day'],
    [nthWeekday(y, 11, 4, 4), 'Thanksgiving'],
    [observed(y, 12, 25), 'Christmas'],
  ]);
  cache.set(y, out);
  return out;
}

/** The holiday's name, or null. `day` is a New York calendar date, YYYY-MM-DD. */
export function marketHoliday(day: string): string | null {
  return marketHolidays(Number(day.slice(0, 4))).get(day) ?? null;
}

/** A weekday that is not a market holiday. */
export function isTradingDay(day: string): boolean {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay();
  return w >= 1 && w <= 5 && !marketHoliday(day);
}
