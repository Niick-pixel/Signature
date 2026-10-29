/* Features 6–8: the plan graded against the day, goals the journal checks itself, and drawings on charts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-goals-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { dayGrade } = await import('../lib/dayGrade');
const G = await import('../lib/goals');
const { drawnR } = await import('../lib/drawing');
const goalsRoute = await import('../app/api/goals/route');
const checkinRoute = await import('../app/api/goals/checkins/route');
const drawRoute = await import('../app/api/drawings/route');
const DG = await import('../db/goals');

let n = 0;
const t = (date: string, o: Record<string, unknown> = {}) => {
  n += 1;
  return { id: `t${n}`, date, account: 'Topstep 50K', status: 'Taken', direction: 'Long', outcome: 'Win', r_multiple: 1, session: 'NY AM',
    grade_letter: 'A', graded_post_hoc: 0, mistake_tags: [], created_at: `${date.slice(0, 10)}T15:00:00`, deleted_at: null, undated: 0, ...o } as never;
};
const prep = (done: number, side?: string) => ({
  steps: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, done).map((k) => [k, 'done'])),
  ticks: {}, answers: side ? { 'draw.side': side } : {},
}) as never;

test('plan grade: a day that kept the plan is an A; the wrong side and trades past the stop pull it down', () => {
  const day = '2026-10-28';
  const good = dayGrade(day, [t(`${day}T08:40`), t(`${day}T09:10`)], prep(5, 'Longs only'), { trades_planned: 2 }, 2);
  assert.equal(good.letter, 'A'); assert.equal(good.score, 100); assert.equal(good.trades, 2);
  const bad = dayGrade(day, [
    t(`${day}T08:40`, { outcome: 'Loss' }), t(`${day}T08:50`, { outcome: 'Loss', direction: 'Short' }), t(`${day}T09:30`),
  ], prep(1, 'Longs only'), { trades_planned: 2 }, 2);
  const kept = Object.fromEntries(bad.parts.map((p) => [p.id, p.kept]));
  assert.deepEqual([kept.prepared, kept.side, kept.count, kept.stop], [false, false, false, false]);
  assert.equal(bad.letter, 'F');
});

test('plan grade: sitting out on a no-trade plan keeps it; replays and other days do not count', () => {
  const day = '2026-10-28';
  const out = dayGrade(day, [t('2026-10-27T08:40', { direction: 'Short' }), t(`${day}T08:40`, { account: 'Backtest (FX Replay)' })], prep(4, 'No trade today'), null, 2);
  assert.equal(out.trades, 0); assert.equal(out.score, 100);
  assert.equal(dayGrade(day, [], prep(1), null, 2).parts.find((p) => p.id === 'prepared')!.kept, false, 'a started prep left short is a miss once the day closes');
});

const ctx = (trades: unknown[], today: string, over: Partial<{ prepDone: (d: string) => number; studyWeek: (m: string) => number }> = {}) =>
  ({ trades: trades as never, today, prepDone: () => 0, studyWeek: () => 0, ...over });
const goal = (kind: string, params = {}, start = '2026-10-19') => ({ id: 'g', kind, title: kind, params, start_day: start, end_day: null, archived: false, created_at: '' }) as never;

test('goals: a stop-after goal counts days kept, the streak, and when it broke', () => {
  const trades = [
    t('2026-10-20T08:40', { outcome: 'Loss' }), t('2026-10-20T08:50', { outcome: 'Loss' }), t('2026-10-20T09:00'), // broke: one after two losses
    t('2026-10-21T08:40', { outcome: 'Loss' }), t('2026-10-21T08:50'),
    t('2026-10-22T08:40'),
    t('2026-10-23T08:40', { account: 'Backtest (FX Replay)', outcome: 'Loss' }),
  ];
  const p = G.goalProgress(goal('stop_after', { n: 2 }), ctx(trades, '2026-10-23'));
  assert.deepEqual([p.units, p.kept, p.streak, p.best], [3, 2, 2, 2], 'days with no live trades say nothing');
  assert.equal(p.lastBroken!.day, '2026-10-20'); assert.match(p.lastBroken!.why, /1 after the stop/);
  assert.equal(p.todayOk, null);
});

test('goals: session, grade, tag and same-day goals judge each day', () => {
  const trades = [t('2026-10-20T08:40'), t('2026-10-20T13:00', { session: 'NY PM', grade_letter: 'C', mistake_tags: ['Chased'] }), t('2026-10-21T08:40', { created_at: '2026-10-23T15:00:00' })];
  const at = ctx(trades, '2026-10-21');
  assert.equal(G.goalProgress(goal('session_only', { sessions: ['NY AM'] }), at).kept, 1);
  assert.equal(G.goalProgress(goal('min_grade', { letter: 'B' }), at).kept, 1);
  assert.equal(G.goalProgress(goal('no_tag', { tag: 'Chased' }), at).lastBroken!.day, '2026-10-20');
  const same = G.goalProgress(goal('same_day'), at);
  assert.equal(same.lastBroken!.day, '2026-10-21'); assert.equal(same.todayOk, false);
});

test('goals: prep on weekdays only, and a morning without prep yet is not a miss; study by the week', () => {
  const prepDone = (d: string) => (d === '2026-10-21' ? 2 : d === '2026-10-28' ? 0 : 5);
  const p = G.goalProgress(goal('prep_done', {}, '2026-10-19'), ctx([], '2026-10-28', { prepDone }));
  assert.equal(p.units, 7, 'Mon 19 – Tue 27, weekdays; today waits'); assert.equal(p.kept, 6);
  const s = G.goalProgress(goal('study', { minutes: 120 }, '2026-10-12'), ctx([], '2026-10-28', { studyWeek: (m: string) => (m === '2026-10-12' ? 150 : m === '2026-10-19' ? 60 : 30) }));
  assert.equal(s.units, 2, 'the running week counts once met'); assert.equal(s.kept, 1);
  assert.equal(G.currentMonday('2026-10-29'), '2026-10-26');
});

test('goals API: create with defaults and a length, check in weekly, archive, delete', async () => {
  const post = (body: unknown) => goalsRoute.POST(new Request('http://x/api/goals', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await post({ kind: 'nope' })).status, 400);
  const { goal: g } = await (await post({ kind: 'max_trades', params: { n: 3 }, start_day: '2026-10-26', days: 30 })).json();
  assert.equal(g.title, 'At most 3 trades a day'); assert.equal(g.end_day, '2026-11-24');
  await checkinRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ goal_id: g.id, week: '2026-10-26', rating: 4, note: 'Held it' }) }));
  await checkinRoute.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ goal_id: g.id, week: '2026-10-26', rating: 5 }) }));
  const list = await (await goalsRoute.GET(new Request('http://x/api/goals?today=2026-10-29'))).json();
  assert.equal(list.goals.length, 1); assert.equal(list.checkins.length, 1); assert.equal(list.checkins[0].rating, 5);
  const dump = DG.exportGoals();
  DG.updateGoal(g.id, { archived: true });
  assert.equal(DG.listGoals()[0].archived, true);
  DG.deleteGoal(g.id);
  assert.equal(DG.listGoals().length, 0);
  assert.equal(DG.listCheckins().length, 0, 'check-ins go with the goal');
  assert.equal(DG.restoreGoals(dump), 1); assert.equal(DG.listCheckins().length, 1);
});

test('drawings: R from the three lines, saved by path, cleared when empty', async () => {
  const lines = [{ type: 'h', role: 'entry', y: 0.5 }, { type: 'h', role: 'stop', y: 0.6 }, { type: 'h', role: 'target', y: 0.25 }] as const;
  assert.equal(drawnR([...lines]), 2.5);
  assert.equal(drawnR(lines.slice(0, 2) as never), null);
  const put = (body: unknown) => drawRoute.PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }));
  assert.equal((await put({ path: '../etc/passwd', items: [] })).status, 400);
  await put({ path: 'shots/a.png', items: [...lines, { type: 'text', x: 0.1, y: 0.1, text: 'sweep' }], r: 2.5 });
  const got = await (await drawRoute.GET(new Request('http://x/api/drawings?path=shots/a.png&path=shots/none.png'))).json();
  assert.equal(got.drawings['shots/a.png'].r, 2.5); assert.equal(got.drawings['shots/a.png'].items.length, 4);
  assert.equal(got.drawings['shots/none.png'], undefined);
  await put({ path: 'shots/a.png', items: [] });
  assert.deepEqual((await (await drawRoute.GET(new Request('http://x/api/drawings?path=shots/a.png'))).json()).drawings, {});
});

test('plan grade: no F before the session, and nothing to grade on a day off', () => {
  const day = '2026-10-29';
  const morning = dayGrade(day, [], null, null, 2, true);
  assert.equal(morning.score, null); assert.equal(morning.parts[0].detail, 'Not yet');
  assert.equal(dayGrade(day, [], prep(2), null, 2, true).parts[0].detail, '2 of 6 prep steps so far');
  assert.equal(dayGrade(day, [t(`${day}T08:40`)], null, null, 2, true).parts[0].kept, false, 'a trade without prep is a miss, even today');
  const weekend = dayGrade('2026-10-25', [t('2026-10-25T10:00', { account: 'Backtest (FX Replay)' })], null, null, 2);
  assert.deepEqual([weekend.score, weekend.parts.length], [null, 0]);
});
