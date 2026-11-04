/* The bell in the database: once per id, snooze brings it back, it clears itself when the reason goes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-notify-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const N = await import('../db/notify');
const { saveDailyReview, saveWeeklyReview } = await import('../db/reviews');
const route = await import('../app/api/reminders/route');
const settingsRoute = await import('../app/api/reminders/settings/route');

// Wednesday 2026-11-04, 08:10 at UTC−6 = 09:10 New York: 20 minutes before the open.
const beforeOpen = new Date('2026-11-04T14:10:00Z');

test('a due reminder is recorded and shown once; the next poll shows nothing new', () => {
  const a = N.tickReminders(beforeOpen);
  assert.deepEqual(a.show.map((n) => n.id).sort(), ['backup-folder:2026-11-02', 'prep:2026-11-04']);
  assert.equal(a.unread, 2);
  const b = N.tickReminders(new Date(beforeOpen.getTime() + 60_000));
  assert.deepEqual(b.show, []);
  assert.equal(N.listNotifications(beforeOpen).length, 2);
});

test('snooze hides it, then it comes back; dismiss is final', () => {
  assert.ok(N.actOnNotification({ id: 'backup-folder:2026-11-02', action: 'snooze', minutes: 15 }, beforeOpen));
  assert.equal(N.unreadCount(), 1);
  assert.deepEqual(N.tickReminders(new Date(beforeOpen.getTime() + 10 * 60_000)).show, []);
  const back = N.tickReminders(new Date(beforeOpen.getTime() + 16 * 60_000));
  assert.deepEqual(back.show.map((n) => n.id), ['backup-folder:2026-11-02']);
  N.actOnNotification({ id: 'backup-folder:2026-11-02', action: 'dismiss' }, beforeOpen);
  assert.equal(N.listNotifications(beforeOpen).some((n) => n.id.startsWith('backup')), false);
});

test('it clears itself once done: the morning and the prep, then the weekly review', () => {
  saveDailyReview('2026-11-04', {}, { checkIn: true });
  // Four prep steps done.
  N.tickReminders(beforeOpen);
  assert.equal(N.listNotifications(beforeOpen).some((n) => n.id === 'prep:2026-11-04'), true, 'still open: prep not done');

  const sunday = new Date('2026-11-08T17:00:00Z');
  assert.ok(N.tickReminders(sunday).show.some((n) => n.id === 'weekly:2026-11-02'));
  saveWeeklyReview('2026-11-02', 'Waited for the sweep every day.', []);
  N.tickReminders(sunday);
  assert.equal(N.listNotifications(sunday).some((n) => n.id === 'weekly:2026-11-02'), false);
});

test('settings: kinds off stop new ones; quiet hours record without popping', async () => {
  await settingsRoute.PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify({ kinds: { weekly: false }, quietFrom: '22:00', quietTo: '07:00' }) }));
  const s = N.getNotifySettings();
  assert.equal(s.kinds.weekly, false);
  assert.equal(s.kinds.prep, true);
  // Saturday 06:00 local: quiet. The backup reminder for the new week is recorded, not shown.
  const r = N.tickReminders(new Date('2026-11-14T12:00:00Z'));
  assert.deepEqual(r.show, []);
  assert.ok(N.listNotifications(new Date('2026-11-14T12:00:00Z')).some((n) => n.id === 'backup-folder:2026-11-09' && n.silent));
});

test('the API: test notification, mark all read, bad actions', async () => {
  const t = await (await route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ test: true }) }))).json();
  assert.equal(t.show[0].kind, 'test');
  const all = await (await route.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ action: 'readAll' }) }))).json();
  assert.equal(all.unread, 0);
  assert.equal((await route.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ action: 'explode' }) }))).status, 400);
  assert.equal((await route.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ action: 'read', id: 'nope' }) }))).status, 404);
  const list = await (await route.GET()).json();
  assert.ok(Array.isArray(list.items));
});
