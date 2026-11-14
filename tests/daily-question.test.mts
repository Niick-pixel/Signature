/* 051: the daily question (one a day, answered once, every question before a repeat), time in the app counted as study time, and a trade's date put right. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-question-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const Q = await import('../lib/dailyQuestion');
const DQ = await import('../db/dailyQuestion');
const AT = await import('../db/appTime');
const { addSession, listSessions } = await import('../db/study');
const { studyTotals } = await import('../lib/study');
const { createTrade, getTrade, setTradeDate, tradeHistory } = await import('../db/trades');
const { parseTradeInput } = await import('../lib/validate');

test('the bank: four options each, a valid answer, an explanation, unique ids', () => {
  assert.ok(Q.QUESTIONS.length >= 40);
  assert.equal(new Set(Q.QUESTIONS.map((q) => q.id)).size, Q.QUESTIONS.length);
  for (const q of Q.QUESTIONS) {
    assert.equal(q.options.length, 4, q.id);
    assert.equal(new Set(q.options).size, 4, `${q.id}: options differ`);
    assert.ok(q.answer >= 0 && q.answer <= 3, q.id);
    assert.ok(q.why.length > 40, q.id);
  }
});

test('one question a day, the same all day, every question once before any comes back', () => {
  assert.equal(Q.questionFor('2026-11-14').id, Q.questionFor('2026-11-14').id);
  const days = Array.from({ length: Q.QUESTIONS.length }, (_, i) => new Date(Date.UTC(2026, 10, 14 + i)).toISOString().slice(0, 10));
  assert.equal(new Set(days.map((d) => Q.questionFor(d).id)).size, Q.QUESTIONS.length);
});

test('answered once: the answer and why come back after, not before; a second answer is refused; the run of days right', () => {
  const before = DQ.todaysQuestion('2026-11-14');
  assert.equal(before.question.answer, undefined, 'no answer before answering');
  assert.equal(before.question.why, undefined);
  const right = Q.questionFor('2026-11-14').answer;
  const a = DQ.answerToday('2026-11-14', right);
  assert.equal(a.correct, true);
  assert.throws(() => DQ.answerToday('2026-11-14', (right + 1) % 4), /already answered/);
  const after = DQ.todaysQuestion('2026-11-14');
  assert.equal(after.question.answer, right);
  assert.ok(after.question.why);
  DQ.answerToday('2026-11-15', Q.questionFor('2026-11-15').answer);
  assert.equal(DQ.todaysQuestion('2026-11-15').stats.streak, 2);
  DQ.answerToday('2026-11-16', (Q.questionFor('2026-11-16').answer + 1) % 4);
  const s = DQ.todaysQuestion('2026-11-16').stats;
  assert.deepEqual([s.answered, s.correct, s.streak], [3, 2, 0], 'a wrong answer ends the run');
  assert.equal(DQ.todaysQuestion('2026-11-16').recent.length, 2);
});

test('time in the app: counted per day, a heartbeat capped; it is the study time of a day with none logged by hand', () => {
  assert.equal(AT.addAppTime('2026-11-14', 30), 30);
  AT.addAppTime('2026-11-14', 10_000); // a clock jump: capped at 120 s
  assert.equal(AT.appTimeOn('2026-11-14'), 150);
  for (let i = 0; i < 40; i++) AT.addAppTime('2026-11-14', 90);
  addSession({ day: '2026-11-13', minutes: 25, note_id: null, topic: 'Liquidity' });
  AT.addAppTime('2026-11-13', 120);
  const merged = AT.withAppTime(listSessions());
  // Nov 14: no session by hand — the app's 62.5 minutes count. Nov 13: the 25 logged count, not the app's 2.
  assert.deepEqual(merged.filter((x) => x.day === '2026-11-14').map((x) => [x.minutes, x.topic]), [[62.5, 'Time in the app']]);
  assert.deepEqual(merged.filter((x) => x.day === '2026-11-13').map((x) => x.minutes), [25]);
  assert.equal(studyTotals(merged, '2026-11-14', 60).today, 63);
});

test('a trade’s date put right: moved, kept in the edit log, an undated backtest becomes dated', () => {
  const r = parseTradeInput({
    date: '2026-11-13T09:50', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
    htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'PDH/PDL', outcome: 'Win', r_multiple: 2, account: 'Demo', status: 'Settled',
    explanation: 'x'.repeat(200), lesson: 'y'.repeat(200), screenshot_path: 'a.png',
  });
  if (!r.ok) throw new Error(r.error);
  const t = createTrade(r.value);
  const moved = setTradeDate(t.id, '2023-09-12T09:45');
  assert.equal(moved.date.slice(0, 16), '2023-09-12T09:45');
  assert.ok(tradeHistory(t.id).some((e) => e.field === 'date' && e.new_value === '2023-09-12T09:45'));
  assert.throws(() => setTradeDate(t.id, 'tomorrow'), /YYYY-MM-DDTHH:mm/);
  assert.equal(getTrade(t.id)!.undated, false);
});
