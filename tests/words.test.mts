/* The word map: automatic words and phrases, stems folded, measured, explained. */
import test from 'node:test';
import assert from 'node:assert/strict';
const W = await import('../lib/wordPatterns');

let n = 0;
const t = (r: number, lesson: string, date = '2026-10-20T07:40') => {
  n += 1;
  return { id: `w${n}`, date, r_multiple: r, outcome: r > 0 ? 'Win' : r < 0 ? 'Loss' : 'Breakeven', explanation: '', lesson } as never;
};

test('stems fold the forms of a word', () => {
  assert.equal(W.stem('chased'), W.stem('chasing'));
  assert.equal(W.stem('chases'), W.stem('chase'));
  assert.equal(W.stem('waited'), W.stem('waiting'));
});

test('words that cost and words that pay, in sentences; stop words and one-offs ignored', () => {
  const ts = [
    t(-1, 'I chased the move again.'), t(-1, 'Chasing after the candle, no patience.'), t(-1.2, 'Chased it.', '2026-10-25T07:40'),
    t(2, 'Waited for the close, clean target.'), t(1.5, 'I waited for the close and it worked.'), t(2.2, 'Waiting for the close paid.', '2026-10-26T07:40'),
    t(0.1, 'Normal day.'), t(-0.2, 'Nothing special happened today.'),
  ];
  const m = W.wordMap(ts, { minN: 3 });
  assert.equal(m.read, 8);
  const chase = m.cost.find((w) => /chas/.test(w.text));
  assert.ok(chase, 'chased/chasing/chased found as one word');
  assert.equal(chase!.n, 3); assert.equal(chase!.losses, 3);
  assert.match(chase!.line, /every one a loss/);
  const wait = m.pay.find((w) => /wait/.test(w.text));
  assert.ok(wait); assert.equal(wait!.n, 3);
  assert.ok(m.words.every((w) => !['the', 'and', 'today'].includes(w.text)));
  assert.ok(!m.words.some((w) => w.text === 'normal'), 'a word written once is not a pattern');
  assert.equal(chase!.weeks.length, 8);
});

test('a phrase covering the same trades as its word replaces it', () => {
  const ts = [t(-1, 'Late entry again.'), t(-1, 'A late entry, chased.'), t(-1, 'Late entry.'), t(1, 'Fine.'), t(1, 'Good one.')];
  const m = W.wordMap(ts, { minN: 3 });
  assert.ok(m.words.some((w) => w.text === 'late entry'));
  assert.ok(!m.words.some((w) => w.text === 'late'));
});
