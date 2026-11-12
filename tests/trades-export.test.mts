/* The Trades tab's "Discuss these trades with Claude" document. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { tradesExport } = await import('../lib/tradesExport');
const { genFakeTrades } = await import('../lib/edge/synthetic');

const now = new Date('2026-11-12T10:00:00Z');

test('it writes every trade it is given, oldest first, with the view and the numbers', () => {
  const trades = genFakeTrades(12, 7).map((t, i) => ({ ...t, explanation: `note ${i}` }));
  const doc = tradesExport({ trades: [...trades].reverse(), shots: new Map(), view: 'Demo · Losses', now });
  assert.match(doc.markdown, /^# Trades — /);
  assert.match(doc.markdown, /as the Trades list showed them: Demo · Losses/);
  assert.match(doc.markdown, /## For Claude: what this is and what I want/);
  assert.match(doc.markdown, /## The numbers/);
  assert.equal((doc.markdown.match(/^### \d{4}-\d{2}-\d{2} /gm) ?? []).length, 12, 'one section per trade');
  const dates = [...doc.markdown.matchAll(/^### (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/gm)].map((m) => m[1]);
  assert.deepEqual(dates, [...dates].sort(), 'oldest first');
  for (let i = 0; i < 12; i++) assert.ok(doc.markdown.includes(`note ${i}`), 'what was written comes along');
  assert.equal(doc.filename, 'signature-trades-2026-11-12');
});

test('an empty view says so instead of writing an empty table', () => {
  const doc = tradesExport({ trades: [], shots: new Map(), now });
  assert.match(doc.markdown, /_No taken trades in this view\._/);
  assert.match(doc.markdown, /_No trades in this view\._/);
});

test('charts are listed for the zip, named after their trade', () => {
  const [t] = genFakeTrades(1, 3);
  const doc = tradesExport({ trades: [{ ...t, explanation: 'x', screenshot_path: 'a/b.png' }], shots: new Map(), now });
  assert.equal(doc.charts.length, 1);
  assert.match(doc.charts[0].name, /^charts\/\d{4}-\d{2}-\d{2}_\d{4}_T-\w+\.png$/);
  assert.ok(doc.markdown.includes(doc.charts[0].name));
});
