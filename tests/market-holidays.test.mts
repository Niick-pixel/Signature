import test from 'node:test';
import assert from 'node:assert/strict';
import { marketHoliday, isTradingDay } from '../lib/marketHolidays.ts';

test('US market holidays, computed, with weekend observance', () => {
  // 2026: published NYSE/CME holiday calendar.
  const y2026 = { '2026-01-01': 'New Year’s Day', '2026-01-19': 'Martin Luther King Jr. Day', '2026-02-16': 'Presidents’ Day',
    '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth', '2026-07-03': 'Independence Day',
    '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving', '2026-12-25': 'Christmas' };
  for (const [d, name] of Object.entries(y2026)) assert.equal(marketHoliday(d), name, d);
  assert.equal(marketHoliday('2027-12-24'), 'Christmas');   // Saturday → Friday
  assert.equal(marketHoliday('2027-03-26'), 'Good Friday');
  assert.equal(isTradingDay('2026-11-04'), true);
  assert.equal(isTradingDay('2026-11-07'), false);           // Saturday
  assert.equal(isTradingDay('2026-11-26'), false);           // Thanksgiving
});
