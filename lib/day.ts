/**
 * Today, as the trader's own calendar has it.
 *
 * `toISOString().slice(0, 10)` is the UTC date, which in the Americas turns
 * over in the evening: from 6pm in Costa Rica "today" was already tomorrow,
 * so opening the day's review after the session landed on a blank page for a
 * day that had not happened. The server runs on the same machine as the
 * window, so local time is the trader's time on both sides.
 */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Whether the form starts a trade without a date. A new trade — a backtest
 * included — starts dated, with now, so it counts on the calendar, the
 * Dashboard and Stats from the moment it is saved; "No date" keeps a replay
 * off the calendar. An existing trade keeps what it has.
 */
export function startsUndated(trade: { undated: boolean } | null | undefined): boolean {
  return trade ? trade.undated : false;
}

/** Local wall-clock time as the form writes it: 2026-10-30T19:30. */
export function localStamp(d: Date = new Date()): string {
  return `${localDay(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
