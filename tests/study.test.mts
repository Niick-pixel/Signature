/* The study room: time and streaks, timestamps and video links, quotes, the database, backgrounds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-study-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const S = await import('../lib/study');
const D = await import('../db/study');
const { getDb } = await import('../db/index');
const { createTrade } = await import('../db/trades');
const { parseTradeInput } = await import('../lib/validate');
const bgs = await import('../app/api/backgrounds/route');
const bg = await import('../app/api/backgrounds/[name]/route');
const marks = await import('../app/api/study/notes/[id]/marks/route');

test('totals: today, the week Monday to Sunday, the streak (today or through yesterday), the record', () => {
  const s = [
    { day: '2026-10-24', minutes: 30 }, { day: '2026-10-25', minutes: 25 }, { day: '2026-10-26', minutes: 10 }, { day: '2026-10-26', minutes: 15 },
    { day: '2026-10-27', minutes: 22 }, { day: '2026-10-28', minutes: 5 }, { day: '2026-10-10', minutes: 60 },
  ];
  const t = S.studyTotals(s, '2026-10-29', 20);
  assert.equal(t.today, 0);
  assert.equal(t.week, 52, 'Mon 25 + Tue 22 + Wed 5');
  assert.equal(t.days[0].day, '2026-10-26');
  assert.equal(t.streak, 0, 'yesterday (5 min) broke it');
  assert.equal(t.best, 4, '24th to 27th');
  assert.equal(S.studyTotals(s, '2026-10-28', 20).streak, 4, 'today not done yet: counts through yesterday');
  assert.equal(S.studyTotals([...s, { day: '2026-10-28', minutes: 20 }], '2026-10-28', 20).streak, 5);
});

test('timestamps and video links', () => {
  assert.equal(S.parseTimestamp('12:30'), 750);
  assert.equal(S.parseTimestamp('1:02:03'), 3723);
  assert.equal(S.parseTimestamp('4m20s'), 260);
  assert.equal(S.parseTimestamp('90'), 90);
  assert.equal(S.parseTimestamp('soon'), null);
  assert.equal(S.formatTimestamp(3723), '1:02:03'); assert.equal(S.formatTimestamp(75), '1:15');
  assert.equal(S.videoAt('https://www.youtube.com/watch?v=abc', 750), 'https://www.youtube.com/watch?v=abc&t=750s');
  assert.equal(S.videoAt('https://youtu.be/abc?t=5', 60), 'https://youtu.be/abc?t=60s');
  assert.equal(S.videoAt('https://vimeo.com/123', 30), 'https://vimeo.com/123#t=30s');
  assert.equal(S.videoAt('https://example.com/v.mp4', 30), 'https://example.com/v.mp4');
  assert.equal(S.cleanUrl('javascript:alert(1)'), null);
  assert.equal(S.cleanUrl('file:///etc/passwd'), null);
  assert.equal(S.cleanUrl(' https://youtu.be/x '), 'https://youtu.be/x');
});

test('quote of the day: the same all day, from the pool asked for', () => {
  const mine = [{ text: 'Wait for the close.', by: 'You' }];
  assert.deepEqual(S.quoteOfDay('2026-10-29', 'both', mine), S.quoteOfDay('2026-10-29', 'both', mine));
  assert.deepEqual(S.quoteOfDay('2026-10-29', 'mine', mine), mine[0]);
  assert.equal(S.quoteOfDay('2026-10-29', 'mine', []), null);
  assert.ok(S.CLASSIC_QUOTES.some((q) => q === S.quoteOfDay('2026-10-29', 'classic', mine)));
});

test('notes, example trades, marks and study time — and the backup restores them once', async () => {
  const r = parseTradeInput({ date: '2026-10-20T07:41', instrument: 'NQ', direction: 'Long', session: 'NY AM', reason: 'Rules-based (A+ setup)', setup_type: 'iFVG',
    htf_bias: 'With bias', premium_discount: 'Discount', target_type: 'Opposing FVG', outcome: 'Win', r_multiple: 2, account: 'Demo',
    explanation: 'E'.repeat(170), lesson: 'Waiting for the close kept me out of the chop. L'.padEnd(170, 'l'), screenshot_path: 'x.png', chk_returned_to_fvg: true, chk_inversion_close: true });
  if (!r.ok) throw new Error(r.error);
  const trade = createTrade(r.value);
  const note = D.createNote({ kind: 'playbook', title: 'Judas swing', tags: ['ny am'] });
  D.linkTrade(note.id, trade.id, 'example');
  D.linkTrade(note.id, 'no-such-trade', 'example');
  assert.deepEqual(D.noteTrades(note.id).map((x) => x.trade_id), [trade.id]);
  assert.deepEqual(D.notesForTrade(trade.id).map((n) => n.title), ['Judas swing']);
  const res = await marks.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ at: '12:30', text: 'The sweep' }) }), { params: Promise.resolve({ id: note.id }) });
  assert.equal(res.status, 201);
  assert.equal((await marks.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ at: 'later' }) }), { params: Promise.resolve({ id: note.id }) })).status, 400);
  assert.equal(D.listMarks(note.id)[0].seconds, 750);
  D.addSession({ day: '2026-10-29', minutes: 25, note_id: note.id, topic: 'Judas swing' });
  assert.equal(D.listSessions().length, 1);
  assert.ok(D.lessonQuotes().some((q) => /Waiting for the close/.test(q.text) && q.tradeId === trade.id));
  assert.equal(D.updateNote(note.id, { pinned: true })!.pinned, true);

  const dump = D.exportStudy();
  getDb().exec('DELETE FROM study_sessions; DELETE FROM video_marks; DELETE FROM study_note_trades; DELETE FROM study_notes;');
  assert.equal(D.restoreStudy(dump), 4);
  assert.equal(D.restoreStudy(dump), 0);
  assert.equal(D.getNote(note.id)!.tags[0], 'ny am');
});

test('backgrounds: upload an image, refuse other files, no way out of the folder, delete', async () => {
  const png = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47])], 'sky.png', { type: 'image/png' });
  const form = new FormData(); form.append('file', png);
  const up = await bgs.POST(new Request('http://x', { method: 'POST', body: form }));
  assert.equal(up.status, 201);
  const { name } = await up.json();
  const bad = new FormData(); bad.append('file', new File(['x'], 'run.exe'));
  assert.equal((await bgs.POST(new Request('http://x', { method: 'POST', body: bad }))).status, 400);
  const get = await bg.GET(new Request('http://x'), { params: Promise.resolve({ name }) });
  assert.equal(get.status, 200); assert.equal(get.headers.get('Content-Type'), 'image/png');
  const part = await bg.GET(new Request('http://x', { headers: { range: 'bytes=1-2' } }), { params: Promise.resolve({ name }) });
  assert.equal(part.status, 206); assert.equal(part.headers.get('Content-Range'), 'bytes 1-2/4');
  assert.equal((await bg.GET(new Request('http://x'), { params: Promise.resolve({ name: '../journal.db' }) })).status, 404);
  await bg.DELETE(new Request('http://x'), { params: Promise.resolve({ name }) });
  assert.equal((await (await bgs.GET()).json()).files.length, 0);
});
