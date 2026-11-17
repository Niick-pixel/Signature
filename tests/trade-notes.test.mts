/* The trade form's notes (lib/tradeNotes): from your own journal, one world at a time, never a signal. */
import test from 'node:test';
import assert from 'node:assert/strict';

const { tradeNotes, GRADE_NOTE_MIN } = await import('../lib/tradeNotes');

let n = 0;
const t = (x: Record<string, unknown> = {}) => {
  n += 1;
  return { id: `t${n}`, account: 'Demo', date: `2026-11-${String(1 + (n % 28)).padStart(2, '0')}T09:40`, created_at: `2026-11-01T09:${String(n % 60).padStart(2, '0')}:00.000Z`,
    outcome: 'Win', status: 'Settled', r_multiple: 1, lesson: '', mistake_tags: [], worked_tags: [], rubric_version: 5, grade_letter: 'A', ...x };
};

test('notes: the last lessons, the mistake tagged most, what worked, newest first; this trade left out', () => {
  const ts = [
    t({ lesson: 'Waited for the close.', mistake_tags: ['Entered late / chased'], worked_tags: ['Followed today\'s plan'] }),
    t({ lesson: 'Sized right.', mistake_tags: ['Entered late / chased'], worked_tags: ['Followed today\'s plan'] }),
    t({ id: 'me', lesson: 'This one is being written.' }),
  ];
  const notes = tradeNotes(ts, { world: 'real', exclude: 'me' });
  assert.equal(notes[0].title, 'Your last lesson');
  assert.equal(notes[0].body, 'Sized right.');
  assert.ok(!notes.some((x) => x.body.includes('being written')));
  assert.ok(notes.some((x) => x.id === 'mistake' && /Entered late/.test(x.body) && /2 of your last 2/.test(x.body)));
  assert.ok(notes.some((x) => x.id === 'worked'));
});

test('notes: backtests read backtests and real accounts read real ones; missed setups never', () => {
  const ts = [t({ account: 'Backtest (FX Replay)', lesson: 'A replay lesson.' }), t({ account: 'Missed', lesson: 'A missed one.' }), t({ lesson: 'A live lesson.' })];
  assert.deepEqual(tradeNotes(ts, { world: 'backtest' }).filter((x) => x.id.startsWith('lesson')).map((x) => x.body), ['A replay lesson.']);
  assert.deepEqual(tradeNotes(ts, { world: 'real' }).filter((x) => x.id.startsWith('lesson')).map((x) => x.body), ['A live lesson.']);
});

test('notes: a grade shows its numbers only from enough Rubric v2 trades, never an old checklist grade', () => {
  const few = Array.from({ length: GRADE_NOTE_MIN - 1 }, () => t({ grade_letter: 'B', r_multiple: -1, outcome: 'Loss' }));
  const g = tradeNotes(few, { world: 'real', grade: 'B' }).find((x) => x.id === 'grade')!;
  assert.match(g.body, /so far — numbers from/);
  const legacy = Array.from({ length: 10 }, () => t({ grade_letter: 'B', rubric_version: 3 }));
  assert.match(tradeNotes([...few, ...legacy], { world: 'real', grade: 'B' }).find((x) => x.id === 'grade')!.body, /so far/, 'legacy B is not a v2 B');
  const enough = [...few, t({ grade_letter: 'B', r_multiple: 3 })];
  const shown = tradeNotes(enough, { world: 'real', grade: 'B' }).find((x) => x.id === 'grade')!;
  assert.match(shown.body, /5 trades · 1W 4L/);
  assert.match(shown.body, /not a verdict/);
  assert.equal(tradeNotes(enough, { world: 'real', grade: 'F' }).find((x) => x.id === 'grade')!.title, 'Graded No trade before');
});

test('honesty card: graded before the outcome, re-graded lower, decided within the clock — one world, the last 50', async () => {
  const { honestyStats } = await import('../lib/tradeNotes');
  const ts = [
    t({ graded_post_hoc: false, regrade: 'B', grade_letter: 'A', decision_seconds: 30, decision_limit: 40 }),
    t({ graded_post_hoc: false, regrade: 'A', grade_letter: 'A', decision_seconds: 50, decision_limit: 40 }),
    t({ graded_post_hoc: true }),
    t({ account: 'Backtest (FX Replay)', graded_post_hoc: true }),
    t({ account: 'Missed', graded_post_hoc: true }),
  ];
  const h = honestyStats(ts as never, 'real');
  assert.deepEqual(h.graded, { pct: 67, n: 3 });
  assert.deepEqual(h.regradedLower, { lower: 1, of: 2 });
  assert.deepEqual(h.inTime, { pct: 50, n: 2 });
  assert.deepEqual(honestyStats([] as never, 'real').graded, { pct: null, n: 0 });
});
