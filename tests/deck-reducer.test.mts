/* The Flaw Deck's gestures: one card per flick, a lock against free-spinning wheels, a bounce at the ends. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { deckReducer, initialDeck, THRESHOLD, LOCK_MS } = await import('../components/work/deckReducer');

test('the wheel accumulates to the threshold, moves one card, then locks', () => {
  let s = initialDeck(5);
  s = deckReducer(s, { type: 'wheel', deltaY: 25, now: 0 });
  s = deckReducer(s, { type: 'wheel', deltaY: 25, now: 10 });
  assert.equal(s.index, 0, 'not yet past the threshold');
  s = deckReducer(s, { type: 'wheel', deltaY: THRESHOLD, now: 20 });
  assert.equal(s.index, 1);
  // A free-spinning wheel keeps sending deltas: nothing moves inside the lock.
  for (let t = 30; t < 20 + LOCK_MS; t += 16) s = deckReducer(s, { type: 'wheel', deltaY: 120, now: t });
  assert.equal(s.index, 1, 'exactly one card per flick');
  s = deckReducer(s, { type: 'wheel', deltaY: 120, now: 20 + LOCK_MS + 1 });
  assert.equal(s.index, 2, 'after the lock, the next flick moves again');
});

test('up moves back; a change of direction resets the count', () => {
  let s = initialDeck(5, 3);
  s = deckReducer(s, { type: 'wheel', deltaY: 40, now: 0 });
  s = deckReducer(s, { type: 'wheel', deltaY: -40, now: 5 });
  assert.equal(s.acc, -40);
  s = deckReducer(s, { type: 'wheel', deltaY: -30, now: 10 });
  assert.deepEqual([s.index, s.dir], [2, -1]);
});

test('at either end it bounces instead of moving', () => {
  let s = initialDeck(3);
  s = deckReducer(s, { type: 'step', dir: -1 });
  assert.deepEqual([s.index, Math.sign(s.bounce)], [0, -1]);
  s = deckReducer(s, { type: 'jump', index: 2 });
  s = deckReducer(s, { type: 'step', dir: 1 });
  assert.deepEqual([s.index, Math.sign(s.bounce)], [2, 1]);
  const again = deckReducer(s, { type: 'step', dir: 1 });
  assert.notEqual(again.bounce, s.bounce, 'each bounce is a new one, so it animates again');
});

test('keys, a jump from the rail, and a deck that shrinks', () => {
  let s = initialDeck(6);
  s = deckReducer(s, { type: 'step', dir: 1 });
  s = deckReducer(s, { type: 'step', dir: 1 });
  assert.equal(s.index, 2);
  s = deckReducer(s, { type: 'jump', index: 99 });
  assert.equal(s.index, 5, 'clamped to the last card');
  s = deckReducer(s, { type: 'count', count: 3 });
  assert.equal(s.index, 2, 'a card gone (a drill started, a snooze) keeps you on a real one');
});
