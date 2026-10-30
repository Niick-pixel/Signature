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
 * Whether a trade in the form starts undated. A backtest never carries a date
 * unless you add one (product rule): a new one starts undated, an edit keeps
 * whatever it had. Other accounts ignore this — they always have a date.
 */
export function startsUndated(trade: { undated: boolean } | null | undefined): boolean {
  return trade ? trade.undated : true;
}
