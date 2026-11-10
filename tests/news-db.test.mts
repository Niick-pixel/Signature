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

test('ForexFactory feed: parsed on its own offset, session news by New York window, red and orange USD only, the prep answer', async () => {
  const N = await import('../lib/news');
  const { nyMinutes } = await import('../lib/planMatch');
  const feed = JSON.stringify([
    { title: 'CPI m/m', country: 'USD', date: '2026-10-29T08:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '0.4%' },
    { title: 'Pending Home Sales m/m', country: 'USD', date: '2026-10-29T10:00:00-04:00', impact: 'Medium' },
    { title: 'Crude Oil Inventories', country: 'USD', date: '2026-10-29T10:30:00-04:00', impact: 'Low' },
    { title: 'German Prelim CPI m/m', country: 'EUR', date: '2026-10-29T08:00:00-04:00', impact: 'High' },
    { title: 'FOMC Statement', country: 'USD', date: '2026-10-29T14:00:00-04:00', impact: 'High' },
    { title: 'bad', country: 'USD', date: 'soon' },
  ]);
  const { events, skipped } = N.parseFfFeed(feed, -6);
  assert.equal(skipped, 1);
  assert.equal(events[0].at, '2026-10-29T06:30', '8:30 New York (EDT) is 6:30 Costa Rica');
  const inSession = N.sessionNews(events, '2026-10-29', ['USD'], { from: '08:30', to: '12:00' }, nyMinutes);
  assert.deepEqual(inSession.map((e) => e.title), ['CPI m/m', 'Pending Home Sales m/m']);
  assert.equal(N.newsAnswer(inSession, nyMinutes), 'Inside the killzone');
  assert.equal(N.newsAnswer(inSession.slice(0, 1), nyMinutes), 'Before the open');
  assert.equal(N.newsAnswer([], nyMinutes), 'None today');
  // After the clocks change (EST), 8:30 New York is 7:30 Costa Rica — and still inside the window.
  const est = N.parseFfFeed(JSON.stringify([{ title: 'NFP', country: 'USD', date: '2026-11-06T08:30:00-05:00', impact: 'High' }]), -6).events;
  assert.equal(est[0].at, '2026-11-06T07:30');
  assert.equal(N.sessionNews(est, '2026-11-06', ['USD'], { from: '08:30', to: '12:00' }, nyMinutes).length, 1);
});

test('sync: a stale pull fetches, a fresh one waits, a failure changes nothing', async () => {
  const D2 = await import('../db/news');
  const feed = JSON.stringify([{ title: 'Retail Sales m/m', country: 'USD', date: '2026-10-30T08:30:00-04:00', impact: 'High' }]);
  let calls = 0;
  const ok = (async () => { calls += 1; return new Response(feed, { status: 200 }); }) as unknown as typeof fetch;
  const r1 = await D2.syncForexFactory(true, ok);
  assert.equal(r1.added, 1); assert.ok(r1.syncedAt);
  const r2 = await D2.syncForexFactory(false, ok);
  assert.equal(r2.skipped, true); assert.equal(calls, 1);
  const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  const r3 = await D2.syncForexFactory(true, down);
  assert.match(r3.error!, /Could not reach/);
  assert.equal(D2.listNews('2026-10-30', '2026-10-30').length, 1);
});

test('forecast and previous: read from the feed, kept, updated on a re-sync, never invented, carried through a backup', async () => {
  const N = await import('../lib/news');
  const feed = (forecast: unknown, previous: unknown) => JSON.stringify([
    { title: 'Non-Farm Employment Change', country: 'USD', date: '2026-12-04T08:30:00-05:00', impact: 'High', forecast, previous },
  ]);
  const first = N.parseFfFeed(feed('150K', '142K'), -6).events[0];
  assert.deepEqual([first.forecast, first.previous], ['150K', '142K']);
  assert.deepEqual([N.parseFfFeed(feed('', null), -6).events[0].forecast, N.parseFfFeed(feed('', null), -6).events[0].previous], [null, null], 'empty is "not given"');

  assert.equal(N.figuresLine(first), 'Forecast 150K · Previous 142K');
  assert.equal(N.figuresLine(first, true), 'f 150K · p 142K');
  assert.equal(N.figuresLine({ forecast: null, previous: '0.3%' }), 'Previous 0.3%');
  assert.equal(N.figuresLine({ forecast: null, previous: null }), null);

  assert.deepEqual(D.addNews([first], 'forexfactory'), { added: 1, already: 0 });
  const stored = () => D.listNews('2026-12-04', '2026-12-04').find((e) => e.title === 'Non-Farm Employment Change')!;
  assert.deepEqual([stored().forecast, stored().previous], ['150K', '142K']);
  // The forecast is revised during the week: a re-sync takes the new figure, adds nothing.
  assert.deepEqual(D.addNews(N.parseFfFeed(feed('165K', '142K'), -6).events, 'forexfactory'), { added: 0, already: 1 });
  assert.equal(stored().forecast, '165K');
  // A copy without figures never wipes the ones already stored.
  D.addNews(N.parseFfFeed(feed('', ''), -6).events, 'forexfactory');
  assert.deepEqual([stored().forecast, stored().previous], ['165K', '142K']);

  // Through an export and back.
  const dump = D.exportNews();
  const id = stored().id;
  D.deleteNews(id);
  assert.ok(D.restoreNews(dump) >= 1);
  assert.deepEqual([stored().forecast, stored().previous], ['165K', '142K']);
});
