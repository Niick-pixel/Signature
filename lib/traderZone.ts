/**
 * The trader's clock.
 *
 * Trades are logged on the computer's wall clock. Converting that to New York
 * time (killzones, the plan, sessions, news) used a fixed Costa Rica offset,
 * UTC−6 — right at home, wrong the day you trade from anywhere else. Now the
 * offset is the computer's own, for that very date (so daylight saving is
 * right too). The server and the window run on the same machine, so both
 * sides agree.
 *
 * SIGNATURE_TRADER_UTC_OFFSET (hours) pins it — the tests use −6 so they read
 * the same on any machine.
 */
function pinned(): number | null {
  const v = typeof process !== 'undefined' ? process.env?.SIGNATURE_TRADER_UTC_OFFSET : undefined;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n * 60 : null;
}

/** Minutes the trader's clock is ahead of UTC at this instant (Costa Rica: −360). */
export function offsetMinutesAt(utcMs: number): number {
  const p = pinned();
  return p ?? -new Date(utcMs).getTimezoneOffset();
}

/** A wall-clock time ('YYYY-MM-DDTHH:mm[:ss]') as a UTC instant, or NaN. */
export function wallToUtc(wall: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(wall);
  if (!m) return NaN;
  const asUtc = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}Z`);
  // Two passes settle the offset across a daylight-saving change.
  let utc = asUtc - offsetMinutesAt(asUtc) * 60_000;
  utc = asUtc - offsetMinutesAt(utc) * 60_000;
  return utc;
}

/** A UTC instant on the trader's wall clock, as a Date whose UTC fields read that wall clock. */
export function utcToWall(utcMs: number): Date {
  return new Date(utcMs + offsetMinutesAt(utcMs) * 60_000);
}
