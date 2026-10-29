/* The news calendar in the database: idempotent import, and red-folder days for the rules (switchable, by currency). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-news-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const D = await import('../db/news');
const { reviewInputs } = await import('../db/review');
const route = await import('../app/api/news/route');

const json = (body: unknown) => new Request('http://x/api/news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('a calendar file imports once; a hand-entered event needs a time and a name', async () => {
  const text = 'Title,Country,Date,Time,Impact\nCPI m/m,USD,10-14-2026,8:30am,High\nGerman ZEW,EUR,10-15-2026,5:00am,High';
  const a = await (await route.POST(json({ text, zone: 'America/New_York' }))).json();
  assert.deepEqual([a.added, a.already], [2, 0]);
  const b = await (await route.POST(json({ text, zone: 'America/New_York' }))).json();
  assert.deepEqual([b.added, b.already], [0, 2]);
  assert.equal((await route.POST(json({ title: 'FOMC' }))).status, 400);
  assert.equal((await route.POST(json({ at: '2026-10-16T12:00', title: 'Retail Sales', impact: 'Medium' }))).status, 201);
  assert.equal(D.listNews('2026-10-14', '2026-10-16').length, 3);
});

test('high-impact events in counted currencies mark red-folder days for the rules; off means off', () => {
  assert.equal(reviewInputs().ctxFor('2026-10-14').redFolder, true, 'USD CPI');
  assert.equal(reviewInputs().ctxFor('2026-10-15').redFolder, false, 'EUR does not count by default');
  assert.equal(reviewInputs().ctxFor('2026-10-16').redFolder, false, 'medium impact does not count');
  D.saveNewsSettings({ currencies: ['USD', 'EUR'] });
  assert.equal(reviewInputs().ctxFor('2026-10-15').redFolder, true);
  D.saveNewsSettings({ marksRed: false });
  assert.equal(reviewInputs().ctxFor('2026-10-14').redFolder, false);
});

test('backup restores events once', () => {
  const dump = D.exportNews();
  for (const e of D.listNews()) D.deleteNews(e.id);
  assert.equal(D.restoreNews(dump), 3);
  assert.equal(D.restoreNews(dump), 0);
});
