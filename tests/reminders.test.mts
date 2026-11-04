import test from 'node:test';
import assert from 'node:assert/strict';
import { clockAt, DEFAULT_NOTIFY, parseNotify, inQuiet } from '../lib/notify.ts';
import { dueReminders, resolvedIds, type ReminderSnapshot, type DayTrade } from '../lib/reminders.ts';

// Tests run at UTC−6 (tests/setup.mts). 2026-11-04 is a Wednesday; New York is on EST (UTC−5),
// so the 09:30 NY open is 08:30 on the trader's wall clock.
const at = (iso: string) => clockAt(new Date(iso));
const snap = (o: Partial<ReminderSnapshot> = {}): ReminderSnapshot => ({
  clock: at('2026-11-04T14:10:00Z'), settings: DEFAULT_NOTIFY, checkInDone: true, prepSteps: 6, today: [],
  maxTrades: 2, maxLosses: 2, cooldownMinutes: 10, unlinkedExecutions: 0, journalPageToday: false,
  weeklyReviewDone: false, news: [], prop: [], backup: { folder: '/backup', lastError: null }, ...o,
});
const trade = (o: Partial<DayTrade>): DayTrade => ({ id: 't', date: '2026-11-04T08:40', outcome: 'Win', r: 2, status: 'Closed', quickLog: false, hasLesson: true, exitTime: null, ...o });
const ids = (s: ReminderSnapshot) => dueReminders(s).map((r) => r.id);

test('clock: wall, New York and trading day', () => {
  const c = at('2026-11-04T14:10:00Z');
  assert.equal(c.wall, '2026-11-04T08:10');
  assert.equal(c.nyMins, 9 * 60 + 10);
  assert.equal(c.nyWeekday, 3);
  assert.equal(c.tradingDay, true);
  assert.equal(at('2026-11-26T15:00:00Z').holiday, 'Thanksgiving');
  // Daylight saving: in October New York is UTC−4, so the open is 07:30 here.
  assert.equal(at('2026-10-14T13:30:00Z').nyMins, 9 * 60 + 30);
  assert.equal(at('2026-10-14T13:30:00Z').wall.slice(11), '07:30');
});

test('settings: parse fills gaps, quiet hours wrap midnight', () => {
  const s = parseNotify({ kinds: { news: false }, quietFrom: '22:00', quietTo: '06:30', prepLead: 'x' });
  assert.equal(s.kinds.news, false);
  assert.equal(s.kinds.prep, true);
  assert.equal(s.prepLead, DEFAULT_NOTIFY.prepLead);
  assert.equal(inQuiet(s, 23 * 60), true);
  assert.equal(inQuiet(s, 5 * 60), true);
  assert.equal(inQuiet(s, 12 * 60), false);
  assert.equal(parseNotify('garbage').enabled, true);
});

test('prep: in the 30 minutes before the open, only while unfinished', () => {
  assert.deepEqual(ids(snap({ prepSteps: 2 })), ['prep:2026-11-04']);
  const r = dueReminders(snap({ checkInDone: false, prepSteps: 2 }))[0];
  assert.match(r.title, /NY open in 20 min/);
  assert.match(r.body, /check-in and the chart prep \(2 of 6/);
  assert.deepEqual(ids(snap()), []);                                                      // all done
  assert.deepEqual(ids(snap({ prepSteps: 2, clock: at('2026-11-04T13:50:00Z') })), []);   // 40 min out
  assert.deepEqual(ids(snap({ prepSteps: 2, clock: at('2026-11-04T14:31:00Z') })), []);   // after the open
  assert.deepEqual(ids(snap({ prepSteps: 2, clock: at('2026-11-26T14:10:00Z') })), []);   // Thanksgiving
  assert.deepEqual(ids(snap({ prepSteps: 2, clock: at('2026-11-26T14:10:00Z'), settings: { ...DEFAULT_NOTIFY, tradingDaysOnly: false } })), ['prep:2026-11-26']);
});

test('news: High releases within the lead time, once each', () => {
  const news = [
    { id: 'e1', at: '2026-11-04T08:20', title: 'ADP', currency: 'USD', impact: 'High' },
    { id: 'e2', at: '2026-11-04T08:20', title: 'Talk', currency: 'USD', impact: 'Medium' },
    { id: 'e3', at: '2026-11-04T09:00', title: 'ISM', currency: 'USD', impact: 'High' },
  ];
  const due = dueReminders(snap({ news }));
  assert.deepEqual(due.map((r) => r.id), ['news:e1']);
  assert.equal(due[0].title, 'USD ADP in 10 min');
  assert.equal(due[0].urgent, true);
});

test('stop rules: losses in a row, then the trade limit — and no cooldown once done', () => {
  const clock = at('2026-11-04T15:30:00Z'); // 09:30 wall
  const two = [trade({ id: 'a', date: '2026-11-04T08:40', outcome: 'Loss', r: -1 }), trade({ id: 'b', date: '2026-11-04T09:00', outcome: 'Loss', r: -1, exitTime: '09:10' })];
  const due = dueReminders(snap({ clock, today: two }));
  assert.deepEqual(due.map((r) => r.id).sort(), ['maxtrades:2026-11-04', 'stop:2026-11-04']);
  assert.match(due.find((r) => r.kind === 'stop' && r.id.startsWith('stop'))!.body, /done for today after 2 losses/);
  // A win between resets the run.
  const mixed = [trade({ id: 'a', outcome: 'Loss', r: -1 }), trade({ id: 'w', date: '2026-11-04T08:50' }), trade({ id: 'b', date: '2026-11-04T09:00', outcome: 'Loss', r: -1 })];
  assert.equal(ids(snap({ clock, today: mixed, maxTrades: 5 })).some((i) => i.startsWith('stop:')), false);
});

test('cooldown: fires after the wait, from the exit time, only for 30 minutes', () => {
  const loss = [trade({ id: 'l1', date: '2026-11-04T08:40', outcome: 'Loss', r: -1, exitTime: '08:55' })];
  const s = (iso: string) => ids(snap({ clock: at(iso), today: loss }));
  assert.deepEqual(s('2026-11-04T15:00:00Z'), []);                      // 09:00 wall: 5 min after exit
  assert.deepEqual(s('2026-11-04T15:06:00Z'), ['cooldown:l1']);         // 11 min after
  assert.deepEqual(s('2026-11-04T15:50:00Z'), []);                      // 55 min after
  const r = dueReminders(snap({ clock: at('2026-11-04T15:06:00Z'), today: loss }))[0];
  assert.match(r.body, /checklist still decides/);
});

test('journal it after the AM session: quick logs, missing lessons, unlinked fills', () => {
  const clock = at('2026-11-04T17:05:00Z'); // 12:05 NY
  const today = [trade({ id: 'q', quickLog: true }), trade({ id: 'n', date: '2026-11-04T09:00', hasLesson: false })];
  const r = dueReminders(snap({ clock, today, unlinkedExecutions: 3, maxTrades: 5 })).find((x) => x.kind === 'journal')!;
  assert.equal(r.id, 'journal:2026-11-04');
  assert.equal(r.body, '1 quick log to finish · 1 trade without a lesson · 3 imported executions not logged.');
  assert.equal(ids(snap({ clock, today: [trade({})] })).includes('journal:2026-11-04'), false);
});

test('evening review: only on a traded day without a page; red days say so', () => {
  const clock = at('2026-11-05T01:30:00Z'); // 19:30 wall on the 4th
  const red = [trade({ outcome: 'Loss', r: -1.5 })];
  const r = dueReminders(snap({ clock, today: red })).find((x) => x.kind === 'evening')!;
  assert.equal(r.id, 'evening:2026-11-04');
  assert.match(r.body, /red day \(-1\.5R\)/);
  assert.equal(ids(snap({ clock, today: red, journalPageToday: true })).some((i) => i.startsWith('evening')), false);
  assert.equal(ids(snap({ clock })).some((i) => i.startsWith('evening')), false);
});

test('weekly review: Friday afternoon and the weekend', () => {
  assert.deepEqual(ids(snap({ clock: at('2026-11-06T18:30:00Z') })), ['weekly:2026-11-02']);  // Fri 13:30 NY
  assert.deepEqual(ids(snap({ clock: at('2026-11-06T16:00:00Z') })), []);                     // Fri 11:00 NY
  assert.deepEqual(ids(snap({ clock: at('2026-11-08T17:00:00Z') })), ['weekly:2026-11-02', 'consistency:2026-11-02']);  // Sunday 11:00 wall
  assert.deepEqual(ids(snap({ clock: at('2026-11-08T17:00:00Z'), weeklyReviewDone: true })), ['consistency:2026-11-02']);
});

test('prop: daily room, drawdown room, payout', () => {
  const base = { id: 'p1', label: 'Apex 50K', dailyLeft: 200, dailyLimit: 1000, room: 2000, maxDrawdown: 2500, payoutAvailable: null, payoutSince: null };
  assert.deepEqual(ids(snap({ prop: [base], today: [trade({})] })), ['prop-daily:p1:2026-11-04']);
  assert.deepEqual(ids(snap({ prop: [base] })), []);   // no trade today, no daily nag
  assert.deepEqual(ids(snap({ prop: [{ ...base, dailyLeft: null, room: 400 }] })), ['prop-room:p1:2026-11-04']);
  const pay = dueReminders(snap({ prop: [{ ...base, dailyLeft: null, payoutAvailable: 1500.4, payoutSince: '2026-10-20' }] }));
  assert.equal(pay[0].id, 'prop-payout:p1:2026-10-20');
  assert.equal(pay[0].body, 'You can request up to $1,500.');
});

test('backup health', () => {
  assert.deepEqual(ids(snap({ backup: { folder: null, lastError: null } })), ['backup-folder:2026-11-02']);
  assert.deepEqual(ids(snap({ backup: { folder: '/b', lastError: 'disk full' } })), ['backup-error:2026-11-04']);
});

test('settings: kinds off, quiet hours, and holding while a trade is Live', () => {
  const s = snap({ prepSteps: 2, news: [{ id: 'e1', at: '2026-11-04T08:20', title: 'ADP', currency: 'USD', impact: 'High' }] });
  assert.deepEqual(ids({ ...s, settings: { ...DEFAULT_NOTIFY, kinds: { ...DEFAULT_NOTIFY.kinds, prep: false } } }), ['news:e1']);
  assert.deepEqual(ids({ ...s, settings: { ...DEFAULT_NOTIFY, enabled: false } }), []);
  const live = { ...s, today: [trade({ status: 'Live', outcome: '', r: null })] };
  assert.deepEqual(ids(live), ['news:e1']);                                      // prep waits
  assert.deepEqual(ids({ ...live, settings: { ...DEFAULT_NOTIFY, holdWhileLive: false } }).sort(), ['news:e1', 'prep:2026-11-04']);
  const quiet = dueReminders({ ...s, settings: { ...DEFAULT_NOTIFY, quietFrom: '08:00', quietTo: '09:00' } });
  assert.equal(quiet.length, 2);
  assert.ok(quiet.every((r) => r.silent));
});

test('resolved: the bell clears what is no longer true', () => {
  const s = snap({ clock: at('2026-11-05T01:30:00Z'), journalPageToday: true, weeklyReviewDone: false });
  assert.deepEqual(resolvedIds(s, ['evening:2026-11-04', 'evening:2026-11-03', 'stop:2026-11-04', 'backup-folder:2026-11-02']), ['evening:2026-11-04', 'backup-folder:2026-11-02']);
  assert.deepEqual(resolvedIds(snap(), ['prep:2026-11-04']), ['prep:2026-11-04']);
  assert.deepEqual(resolvedIds(snap({ prepSteps: 1 }), ['prep:2026-11-04']), []);
});

test('Sunday consistency report: from 10:00, with the week in its body', () => {
  const sunday = at('2026-11-08T17:00:00Z');
  const r = dueReminders(snap({ clock: sunday, weeklyReviewDone: true, weekClosed: { closed: 3, of: 5 } }))[0];
  assert.equal(r.route, '/consistency?week=2026-11-02');
  assert.match(r.body, /^3 of 5 trading days/);
  assert.deepEqual(ids(snap({ clock: at('2026-11-08T15:00:00Z'), weeklyReviewDone: true })), []); // 09:00
});
