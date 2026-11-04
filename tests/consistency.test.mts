import test from 'node:test';
import assert from 'node:assert/strict';
import { dayRings, fairStreak, weekReport, type DayInput } from '../lib/consistency.ts';
import { studyTotals } from '../lib/study.ts';

const day = (d: string, o: Partial<DayInput> = {}): DayInput => ({ day: d, checkedIn: true, prepSteps: 5, trades: 1, broke: 0, unfinished: 0, reviewed: true, ...o });

test('rings: each ring on its own; a day without trades has nothing to journal or review', () => {
  const full = dayRings(day('2026-11-04'));
  assert.deepEqual(full.rings, { prep: 'done', rules: 'done', journal: 'done', review: 'done' });
  assert.equal(full.closed, true);
  const messy = dayRings(day('2026-11-04', { prepSteps: 3, broke: 1, unfinished: 2, reviewed: false }));
  assert.deepEqual(messy.rings, { prep: 'open', rules: 'open', journal: 'open', review: 'open' });
  assert.equal(messy.done, 0);
  const sat = dayRings(day('2026-11-04', { trades: 0, reviewed: false }));
  assert.deepEqual(sat.rings, { prep: 'done', rules: 'done', journal: 'na', review: 'na' });
  assert.deepEqual([sat.done, sat.of, sat.closed], [2, 2, true]);
  assert.equal(dayRings(day('2026-11-26')).holiday, 'Thanksgiving');
});

test('fair streak: weekends and holidays skipped, today never breaks it', () => {
  // Kept every trading day from Mon 2026-11-16; Thanksgiving (26th) and weekends do not count.
  const kept = (d: string) => d >= '2026-11-16';
  const s = fairStreak(kept, '2026-11-30', { tradingOnly: true, restDay: false }, '2026-11-02');
  assert.equal(s.current, 10); // 16–20 (5), 23–25, 27 (4), 30 (1)
  // Today still open: the streak stands at yesterday's.
  const open = (d: string) => d >= '2026-11-16' && d !== '2026-11-30';
  assert.equal(fairStreak(open, '2026-11-30', { tradingOnly: true, restDay: false }, '2026-11-02').current, 9);
});

test('fair streak: the rest day forgives one open day a week, not two', () => {
  const misses = new Set(['2026-11-11']);
  const kept = (d: string) => !misses.has(d);
  const opts = { tradingOnly: true, restDay: true };
  const one = fairStreak(kept, '2026-11-13', opts, '2026-11-09');
  assert.equal(one.current, 4);
  assert.deepEqual(one.rested, ['2026-11-11']);
  misses.add('2026-11-12');
  assert.equal(fairStreak(kept, '2026-11-13', opts, '2026-11-09').current, 1);
  assert.equal(fairStreak(kept, '2026-11-13', { ...opts, restDay: false }, '2026-11-09').current, 1);
  // Best survives a break.
  assert.equal(fairStreak((d) => d !== '2026-11-18', '2026-11-20', { tradingOnly: true, restDay: false }, '2026-11-09').best, 7);
});

test('weekly report: closed days, ring rates against last week, the weakest ring', () => {
  const inputs = [
    day('2026-11-02'), day('2026-11-03', { reviewed: false }), day('2026-11-04'), day('2026-11-05'), day('2026-11-06'),
    day('2026-11-09', { unfinished: 1 }), day('2026-11-10', { unfinished: 1, broke: 1 }), day('2026-11-11', { trades: 0 }),
    day('2026-11-12', { unfinished: 2 }), day('2026-11-13'), day('2026-11-14', { trades: 3 }), // Saturday: not a trading day
  ];
  const r = weekReport('2026-11-09', inputs);
  assert.equal(r.tradingDays, 5);
  assert.equal(r.closedDays, 2); // the 11th (sat out) and the 13th
  assert.deepEqual(r.ringRates.journal, { done: 1, of: 4 });
  assert.deepEqual(r.lastWeek.review, { done: 4, of: 5 });
  assert.equal(r.weakest, 'journal');
  assert.deepEqual([r.tradesTaken, r.tradesBroke], [4, 1]);
});

test('study streak keeps its meaning, and the rest day forgives one day', () => {
  const s = (days: string[]) => days.map((d) => ({ day: d, minutes: 30 }));
  const t = studyTotals(s(['2026-11-01', '2026-11-02', '2026-11-03']), '2026-11-04', 20);
  assert.deepEqual([t.streak, t.best], [3, 3]);
  const gap = s(['2026-11-01', '2026-11-03', '2026-11-04']);
  assert.equal(studyTotals(gap, '2026-11-04', 20).streak, 2);
  assert.equal(studyTotals(gap, '2026-11-04', 20, true).streak, 3);
});
