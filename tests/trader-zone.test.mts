import test from 'node:test';
import assert from 'node:assert/strict';

const zone = await import('../lib/traderZone.ts');
const { nyMinutes } = await import('../lib/planMatch.ts');

function withMachine(tz: string, fn: () => void) {
  const pin = process.env.SIGNATURE_TRADER_UTC_OFFSET; const was = process.env.TZ;
  delete process.env.SIGNATURE_TRADER_UTC_OFFSET; process.env.TZ = tz;
  try { fn(); } finally {
    if (pin != null) process.env.SIGNATURE_TRADER_UTC_OFFSET = pin;
    if (was == null) delete process.env.TZ; else process.env.TZ = was;
  }
}

test('pinned: the tests run on Costa Rica time', () => {
  assert.equal(zone.offsetMinutesAt(Date.parse('2026-07-01T12:00:00Z')), -360);
  assert.equal(nyMinutes('2026-07-01T07:30'), 9 * 60 + 30); // 07:30 CR = 09:30 NY in summer
  assert.equal(nyMinutes('2026-01-15T07:30'), 8 * 60 + 30); // and 08:30 NY in winter
});

test("unpinned: the computer's own zone, daylight saving included", () => {
  withMachine('America/Costa_Rica', () => {
    assert.equal(zone.offsetMinutesAt(Date.parse('2026-07-01T12:00:00Z')), -360);
    assert.equal(new Date(zone.wallToUtc('2026-07-01T07:30')).toISOString(), '2026-07-01T13:30:00.000Z');
  });
  withMachine('America/New_York', () => {
    // Trading from New York itself: the wall clock is New York time, summer and winter.
    assert.equal(nyMinutes('2026-07-01T09:30'), 9 * 60 + 30);
    assert.equal(nyMinutes('2026-01-15T09:30'), 9 * 60 + 30);
    assert.equal(zone.utcToWall(Date.parse('2026-01-15T14:30:00Z')).toISOString().slice(11, 16), '09:30');
  });
  withMachine('Europe/Madrid', () => {
    assert.equal(nyMinutes('2026-07-01T15:30'), 9 * 60 + 30);
  });
});
