/* Every time on screen is the trader's clock (lib/localTime). Tests pin UTC−6 (tests/setup.mts), no daylight saving. */
import test from 'node:test';
import assert from 'node:assert/strict';
const L = await import('../lib/localTime');
const { replayTradeDate } = await import('../lib/replay');

test('a New York time, read on the trader\'s clock on its own date: one hour behind in winter, two in summer', () => {
  assert.equal(L.nyToLocal('9:30', '2026-11-25'), '08:30');
  assert.equal(L.nyToLocal('9:30', '2026-07-01'), '07:30');
  assert.equal(L.nyToLocal(18 * 60, '2026-11-25'), '17:00', 'the futures day starts at 6pm New York');
  assert.equal(L.localOpen('2026-03-09'), '07:30', 'the US changed its clocks on March 8');
  assert.equal(L.localOpen('2026-03-06'), '08:30');
});

test('labels written in New York time read locally, and the zone name goes', () => {
  assert.equal(L.localizeNy('Data at 8:30 ET', '2026-11-25'), 'Data at 07:30');
  assert.equal(L.localizeNy('Not triggered by 10:30', '2026-07-01'), 'Not triggered by 08:30');
  assert.equal(L.localizeNy('From the open (9:30)', '2026-11-25'), 'From the open (08:30)');
  assert.equal(L.localizeNy('Afternoon FOMC or speaker'), 'Afternoon FOMC or speaker', 'no time, no change');
});

test('a setting kept in New York time is typed locally and stored back the same', () => {
  assert.equal(L.localToNy('08:30', '2026-11-25'), '09:30');
  assert.equal(L.localToNy(L.nyToLocal('11:15', '2026-07-01'), '2026-07-01'), '11:15');
});

test('a backtest on a replay day is stored on the trader\'s clock, at the session\'s New York time that date', () => {
  assert.equal(replayTradeDate('2026-07-01', 'NY AM'), '2026-07-01T07:45');
  assert.equal(replayTradeDate('2025-12-03', 'NY AM'), '2025-12-03T08:45');
});
