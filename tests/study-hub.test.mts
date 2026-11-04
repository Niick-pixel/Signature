/* The study rework in the database: cards from trades, reviews, the daily limit, the lesson library, watch later. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-hub-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const H = await import('../db/studyHub');
const { createTrade } = await import('../db/trades');
const { parseTradeInput } = await import('../lib/validate');
const { getNote } = await import('../db/study');
const cardsRoute = await import('../app/api/study/cards/route');
const laterRoute = await import('../app/api/study/later/route');

const trade = (i: number, o: Record<string, unknown> = {}) => {
  const r = parseTradeInput({ date: `2026-10-${String(10 + i).padStart(2, '0')}T07:41`, instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
    htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'Opposing FVG', outcome: 'Loss', r_multiple: -1, account: 'Demo',
    explanation: 'E'.repeat(170), lesson: `Entered before the close, again — wait for the candle to close. ${i}`.padEnd(170, '.'), screenshot_path: `s${i}.png`, ...o });
  if (!r.ok) throw new Error(r.error);
  return createTrade(r.value);
};

test('every trade with a chart and a lesson becomes a card; new ones come in at the daily limit', () => {
  const ids = Array.from({ length: 12 }, (_, i) => trade(i).id);
  const q = H.cardQueue('2026-11-04');
  assert.equal(q.stats.deck, 12);
  assert.equal(q.cards.length, 10, 'ten new a day by default');
  assert.ok(q.cards.every((c) => c.isNew && c.lesson.startsWith('Entered')));
  // The leak's trades first.
  assert.equal(H.cardQueue('2026-11-04', new Set([ids[11]])).cards[0].tradeId, ids[11]);
  assert.deepEqual(q.cards[0].next, { again: 1, hard: 1, good: 1, easy: 4 });
});

test('a review schedules the card and counts against today\'s new cards', async () => {
  const first = H.cardQueue('2026-11-04').cards[0];
  const res = await cardsRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ tradeId: first.tradeId, rating: 'good', today: '2026-11-04' }) }));
  assert.deepEqual(await res.json(), { due: '2026-11-05', interval: 1 });
  const after = H.cardQueue('2026-11-04');
  assert.equal(after.cards.length, 9);
  assert.equal(after.stats.reviewedToday, 1);
  // Tomorrow it is due, ahead of the new ones.
  assert.equal(H.cardQueue('2026-11-05').cards[0].tradeId, first.tradeId);
  assert.equal((await cardsRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ tradeId: first.tradeId, rating: 'meh' }) }))).status, 400);
  H.setNewPerDay(2);
  assert.equal(H.cardQueue('2026-11-04').cards.length, 1);
  assert.ok(H.suspendCard(first.tradeId, true));
  assert.equal(H.cardQueue('2026-11-05').cards.some((c) => c.tradeId === first.tradeId), false);
});

test('the lesson library: every lesson, newest first, with its themes', () => {
  const lib = H.lessonLibrary();
  assert.equal(lib.lessons.length, 12);
  assert.equal(lib.lessons[0].date, '2026-10-21');
  assert.ok(lib.lessons.every((l) => l.mistakes.length === 0 && Array.isArray(l.themes)));
});

test('watch later: links only; starting one makes a video note and takes it off the list', async () => {
  assert.equal((await laterRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ url: 'javascript:alert(1)' }) }))).status, 400);
  const { item } = await (await laterRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=abc', title: 'Market structure', why: 'The sweep part' }) }))).json();
  const { noteId } = await (await laterRoute.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ id: item.id, action: 'start' }) }))).json();
  const note = getNote(noteId)!;
  assert.deepEqual([note.kind, note.title, note.url], ['video', 'Market structure', 'https://www.youtube.com/watch?v=abc']);
  assert.ok(H.listWatchLater()[0].done_at);
});
