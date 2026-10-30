/* The Stats key points: plain words from the engine's own numbers. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { summarize } = await import('../lib/edge/summary');
const { edgeMetrics } = await import('../lib/edge/metrics');
const { maturity } = await import('../lib/edge/maturity');

const mkFocus = (leak: unknown, strength: unknown = null, clear = false) => ({ leak, strength, leakClear: clear, experiment: null, candidates: [] }) as never;
const item = (label: string, diff: number) => ({ kind: 'state', key: 'k', label, n: 10, recent: 9, priority: 1, tradeIds: [], experiment: 'One trade a day.', cmp: { diff, verdict: { level: 'hint', direction: 'negative', p: 0.85 } } });

test('a losing record says so, names the fix, and never puts a plus sign on a loss', () => {
  const m = edgeMetrics(Array.from({ length: 30 }, (_, i) => ({ r: i % 5 === 0 ? 2 : -1 })));
  const s = summarize({ m, focus: mkFocus(item('A 2nd or later trade of the day', -0.26), item('Waited for the close', 0.23), true), split: null, adherence: { kept: 20, n: 30, rate: 2 / 3 }, cone: null, mat: maturity(30), missingCore: ['entry method'] });
  const edge = s.points.find((p) => p.id === 'edge')!;
  assert.equal(edge.headline, 'Not profitable yet'); assert.equal(edge.tone, 'bad');
  assert.ok(/You lose \d/.test(edge.body), edge.body);
  assert.ok(s.points.find((p) => p.id === 'fix')!.body.startsWith('It costs about 0.26R'));
  assert.ok(s.line.startsWith('You are not profitable yet; fix first: a 2nd or later trade of the day'));
  assert.deepEqual(s.points.map((p) => p.id), ['edge', 'fix', 'keep', 'rules', 'risk', 'next']);
  assert.ok(s.points.find((p) => p.id === 'next')!.body.includes('entry method'));
});

test('a proven edge reads as real; an unclear leak is offered as a candidate, not a verdict', () => {
  const m = edgeMetrics(Array.from({ length: 200 }, (_, i) => ({ r: i % 2 ? 2 : -1 })));
  const s = summarize({ m, focus: mkFocus(item('Trading right after a loss', -0.1)), split: null, adherence: { kept: 0, n: 0, rate: null }, cone: null, mat: maturity(200), missingCore: [] });
  assert.equal(s.points[0].headline, 'Your edge looks real');
  assert.ok(s.points[1].body.includes('Not proven yet'));
  assert.equal(s.points[1].tone, 'watch');
});
