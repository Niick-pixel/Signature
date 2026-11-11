/* Smart Rotate's attention score: deterministic, ordered by what matters, never over your order without a reason. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHT, scoreOf, pickFront, ruleToday, flawNews, integrityNews, drillMilestone, type Attention } from '../lib/dashboard/attention';

test('a rule broken today outranks a new flaw, which outranks data, which outranks a drill milestone — at any strength', () => {
  const order = (['rule-today', 'new-flaw', 'integrity', 'drill-milestone'] as const);
  for (let i = 0; i < order.length - 1; i++) {
    const weak: Attention = { signal: order[i], strength: 0, reason: '' };
    const strong: Attention = { signal: order[i + 1], strength: 9, reason: '' };
    assert.ok(scoreOf(weak) > scoreOf(strong), `${order[i]} > ${order[i + 1]}`);
  }
  assert.equal(scoreOf(null), 0);
  assert.equal(scoreOf({ signal: 'integrity', strength: 99, reason: '' }), WEIGHT.integrity + 9, 'strength is capped at 9');
});

test('pickFront: the highest score wins, a tie goes to the one higher in the stack, nothing keeps the saved one', () => {
  const a = (signal: Attention['signal'], strength = 1): Attention => ({ signal, strength, reason: signal });
  assert.deepEqual(pickFront([null, a('integrity'), a('rule-today')], 0), { index: 2, reason: 'rule-today' });
  assert.deepEqual(pickFront([a('new-flaw', 4), a('new-flaw', 4)], 1), { index: 0, reason: 'new-flaw' });
  assert.deepEqual(pickFront([null, null, null], 2), { index: 2, reason: null });
  assert.deepEqual(pickFront([null, null], 7), { index: 1, reason: null }, 'a saved index past the end is clamped');
  // Same input, same answer.
  const xs = [a('drill-milestone', 3), null, a('integrity', 2)];
  assert.deepEqual(pickFront(xs, 0), pickFront(xs, 0));
});

test('ruleToday: only trades dated today with a break count', () => {
  const trades = [{ id: '1', date: '2026-11-10' }, { id: '2', date: '2026-11-11' }, { id: '3', date: '2026-11-11T09:30' }, { id: '4', date: '2026-11-11' }];
  const broke = new Set(['1', '2', '3']);
  const r = ruleToday(trades, (t) => (broke.has(t.id) ? ['x'] : []), '2026-11-11');
  assert.equal(r?.strength, 2);
  assert.equal(r?.reason, '2 trades today broke a rule');
  assert.equal(ruleToday(trades, () => [], '2026-11-11'), null);
});

test('flawNews: new when every hit is in the last 5 trades; again when it hit the latest; otherwise quiet', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  assert.equal(flawNews({ title: 'Late entry', hits: ['f', 'h'] }, ids)?.strength, 9);
  assert.equal(flawNews({ title: 'Late entry', hits: ['a', 'h'] }, ids)?.strength, 4);
  assert.equal(flawNews({ title: 'Late entry', hits: ['a', 'c'] }, ids), null);
  assert.equal(flawNews(null, ids), null);
  assert.equal(flawNews({ title: 'X', hits: [] }, ids), null);
});

test('integrityNews: a bug outranks any number of warnings; notes never rotate', () => {
  const bug = integrityNews([{ tone: 'bug' }])!; const warns = integrityNews([{ tone: 'warn' }, { tone: 'warn' }, { tone: 'warn' }, { tone: 'warn' }, { tone: 'warn' }])!;
  assert.ok(scoreOf(bug) > scoreOf(warns));
  assert.equal(integrityNews([{ tone: 'note' }]), null);
});

test('drillMilestone: 5 / 10 / 15 clean in a row, or graduated; anything else is quiet', () => {
  assert.equal(drillMilestone({ clean: 10, graduated: false })?.reason, '10 clean trades in a row on your drill');
  assert.equal(drillMilestone({ clean: 7, graduated: false }), null);
  assert.equal(drillMilestone({ clean: 20, graduated: true })?.strength, 9);
  assert.equal(drillMilestone(null), null);
});
