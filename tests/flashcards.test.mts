import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_CARD, cardable, preview, schedule, todaysQueue } from '../lib/flashcards.ts';

const T = '2026-11-04';

test('a new card: Good → 1 day, then 3, then interval × ease', () => {
  const a = schedule(NEW_CARD, 'good', T);
  assert.deepEqual([a.interval, a.due, a.reps], [1, '2026-11-05', 1]);
  const b = schedule(a, 'good', '2026-11-05');
  assert.deepEqual([b.interval, b.due], [3, '2026-11-08']);
  const c = schedule(b, 'good', '2026-11-08');
  assert.equal(c.interval, 8); // round(3 × 2.5)
  assert.equal(c.ease, 2.5);
});

test('Easy jumps and raises ease; Hard slows and lowers it; Again resets and counts a lapse', () => {
  assert.deepEqual([schedule(NEW_CARD, 'easy', T).interval, schedule(NEW_CARD, 'easy', T).ease], [4, 2.65]);
  const mature = { interval: 10, ease: 2.5, reps: 4, lapses: 0 };
  assert.deepEqual([schedule(mature, 'hard', T).interval, schedule(mature, 'hard', T).ease], [12, 2.35]);
  assert.equal(schedule(mature, 'easy', T).interval, 33);
  const lapsed = schedule(mature, 'again', T);
  assert.deepEqual([lapsed.interval, lapsed.reps, lapsed.lapses, lapsed.ease], [1, 0, 1, 2.3]);
});

test('ease is bounded, intervals cap at a year, preview matches', () => {
  let c = { interval: 1, ease: 1.3, reps: 3, lapses: 5 };
  c = schedule(c, 'again', T);
  assert.equal(c.ease, 1.3);
  assert.equal(schedule({ interval: 300, ease: 3, reps: 9, lapses: 0 }, 'easy', T).interval, 365);
  assert.deepEqual(preview(NEW_CARD, T), { again: 1, hard: 1, good: 1, easy: 4 });
});

test('cards need a chart and a real lesson', () => {
  assert.equal(cardable({ lesson: 'Waited for the close.', screenshot_path: 'a.png', deleted_at: null }), true);
  assert.equal(cardable({ lesson: 'ok', screenshot_path: 'a.png', deleted_at: null }), false);
  assert.equal(cardable({ lesson: 'Waited for the close.', screenshot_path: null, deleted_at: null }), false);
});

test("today's queue: due first (oldest first), then new up to the daily limit, the leak's trades first", () => {
  const cards = [
    { trade_id: 'a', due: '2026-11-03', introduced: '2026-11-01' },
    { trade_id: 'b', due: '2026-11-01', introduced: '2026-10-30' },
    { trade_id: 'c', due: '2026-11-09', introduced: '2026-11-02' },
    { trade_id: 'd', due: null, introduced: null },
    { trade_id: 'e', due: null, introduced: null },
    { trade_id: 'f', due: null, introduced: null },
    { trade_id: 'g', due: '2026-11-05', introduced: T },
  ];
  const q = todaysQueue(cards, T, 3, new Set(['f']));
  assert.deepEqual(q.due.map((c) => c.trade_id), ['b', 'a']);
  assert.deepEqual(q.fresh.map((c) => c.trade_id), ['f', 'd']); // 3 a day, 1 already introduced today
});
