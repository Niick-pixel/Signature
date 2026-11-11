/* lib/tagLayout: the longest tag labels in the middle column, every option exactly once, original order kept. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { centerOut } = await import('../lib/tagLayout');

test('longest in the middle, nothing lost, order kept within a column', () => {
  const opts = ['Chased', 'Revenge', 'Long in discount / short in premium', 'Oversized', 'Opposing HTF gap in path', 'Moved stop', 'Took it before the sweep'];
  const rows = centerOut(opts);
  const middle = rows.map((r) => r[1]).filter(Boolean);
  assert.deepEqual(middle, ['Long in discount / short in premium', 'Opposing HTF gap in path', 'Took it before the sweep']);
  const all = rows.flat().filter(Boolean).sort();
  assert.deepEqual(all, [...opts].sort(), 'every option exactly once');
  assert.deepEqual(rows.map((r) => r[0]).filter(Boolean), ['Chased', 'Oversized']);
  assert.deepEqual(rows.map((r) => r[2]).filter(Boolean), ['Revenge', 'Moved stop']);
  assert.deepEqual(centerOut([]), []);
  assert.deepEqual(centerOut(['A']), [[null, 'A', null]]);
});
