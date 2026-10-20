/* Learning from my own words: themes, repeated lessons, phrases, conditions. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { analyse, analyseTheme, THEMES, distinctivePhrases, sentences, effectiveR } = await import('../lib/insights');

let n = 0;
const t = (x: Record<string, unknown>) => ({
  id: `t${++n}`, date: `2026-10-${String(1 + (n % 27)).padStart(2, '0')}T09:45`, account: 'Demo', status: 'Settled',
  outcome: 'Loss', r_multiple: -1, direction: 'Long', premium_discount: 'Discount', htf_bias: 'With bias',
  sweep_tier: 'major', target_type: 'PDH/PDL', confidence_at_entry: 3, followed_rules: null, target_check_passed: null,
  mistake_tags: [], worked_tags: [], explanation: '', lesson: '', deleted_at: null, ...x,
}) as never;
const theme = (id: string) => THEMES.find((d) => d.id === id)!;

test('sentences split on stops and run-on commas', () => {
  assert.deepEqual(sentences('One. Two!\nThree'), ['One.', 'Two!', 'Three']);
});

test('a theme is found in my words — and in a tag, even when the words differ', () => {
  const trades = [
    t({ lesson: 'There was no clean target, market felt no attraction to it.' }),
    t({ lesson: 'Fine trade.', mistake_tags: ['No defined target'] }),
    t({ outcome: 'Win', r_multiple: 2, lesson: 'A clean and powerful target makes each trade easy.' }),
  ];
  const r = analyseTheme(theme('target'), trades);
  assert.equal(r.n, 2, 'the positive lesson is not a complaint about targets');
  assert.equal(r.inWords, 1);
  assert.equal(r.netR, -2);
  assert.match(r.quotes[0].text, /no clean target/);
});

test('a lesson written again and again, and what happened after the first one', () => {
  const trades = [
    t({ date: '2026-10-01T09:45', lesson: 'Entered against my bias, never again.' }),
    t({ date: '2026-10-05T09:45', lesson: 'Against bias again.' }),
    t({ date: '2026-10-08T09:45', htf_bias: 'Against bias', lesson: 'Just a loss.' }),
    t({ date: '2026-10-09T09:45', outcome: 'Win', r_multiple: 1.5, lesson: 'With the bias this time.' }),
  ];
  const r = analyseTheme(theme('bias'), trades);
  assert.equal(r.lessons, 2);
  assert.equal(r.firstLesson, '2026-10-01');
  assert.deepEqual(r.afterFirstLesson, { n: 2, netR: -2 });
  assert.equal(r.recent, 3);
});

test('a missed winner counts as R left on the table', () => {
  assert.equal(effectiveR(t({ account: 'Missed', outcome: 'Win', r_multiple: 2 })), -2);
  assert.equal(effectiveR(t({ outcome: 'Win', r_multiple: 2 })), 2);
});

test('phrases that set losers apart from winners', () => {
  const L = (s: string) => t({ explanation: s });
  const W = (s: string) => t({ outcome: 'Win', r_multiple: 2, explanation: s });
  const p = distinctivePhrases([
    L('Entered late on equilibrium, no momentum.'), L('Chased it, entered late again.'), L('Entered late, unsure of the target.'),
    W('Waited for the data wick, clean draw.'), W('Data wick target, waited for the close.'), W('Swept the lows, data wick hit.'),
  ]);
  assert.equal(p.losers[0].text, 'entered late');
  assert.equal(p.winners[0].text, 'data wick');
});

test('the focus is the costliest repeated pattern; conditions compare with and without', () => {
  const trades = [
    ...Array.from({ length: 10 }, () => t({ mistake_tags: ['No trigger'], lesson: 'I entered too soon, before the close.' })),
    ...Array.from({ length: 10 }, () => t({ outcome: 'Win', r_multiple: 2, worked_tags: ['Waited for the close'], lesson: 'Waited for the close.' })),
  ];
  const r = analyse(trades);
  assert.equal(r.focus?.id, 'early');
  // Under 20 trades in view, no pattern is named the #1 leak.
  assert.equal(analyse(trades.slice(0, 19)).focus, null);
  assert.equal(r.costly[0].label, 'Tagged “No trigger”');
  assert.ok(r.paying.some((c) => c.label === '“Waited for the close”'));
  assert.ok(!r.paying.some((c) => c.id.startsWith('mistake:')), 'a mistake tag is never listed as paying');
});

test('plans and passes are not read', () => {
  const r = analyse([t({ status: 'Planned', outcome: 'Not taken', lesson: 'no clean target' }), t({ outcome: 'Not taken', lesson: 'no clean target' })]);
  assert.equal(r.read, 0);
});

test('"not going against my bias" is following it, not breaking it', () => {
  const r = analyseTheme(theme('bias'), [t({ lesson: 'No longs due to not going against my bias.' }), t({ lesson: 'I went against my bias.' })]);
  assert.equal(r.n, 1);
});

test('the phrase dictionary: plain phrases match whole words, * spans a few words', async () => {
  const { compilePhrase } = await import('../lib/phrases');
  assert.ok(compilePhrase('unsure * target').test('I was unsure of the target.'));
  assert.ok(compilePhrase('no clean target').test('No clean target, again'));
  assert.ok(!compilePhrase('late').test('the plate'));
});
