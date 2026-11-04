import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DASH_ROW, parseDashRow } from '../lib/preferences.ts';

test('the bottom row: old switches carry over, junk and duplicates are dropped, four at most', () => {
  assert.deepEqual(parseDashRow(undefined), DEFAULT_DASH_ROW);
  // Before it was modular: the prop block switched off stays off.
  assert.deepEqual(parseDashRow(undefined, { prop: false }).map((s) => s.id), ['score', 'recent']);
  assert.deepEqual(parseDashRow([{ id: 'month', size: 1 }, { id: 'nope', size: 2 }, { id: 'month', size: 2 }, { id: 'goals', size: 7 }]),
    [{ id: 'month', size: 1 }, { id: 'goals', size: 2 }]);
  assert.equal(parseDashRow(['score', 'recent', 'prop', 'study', 'goals', 'news'].map((id) => ({ id, size: 1 }))).length, 4);
  assert.deepEqual(parseDashRow([]), []);
});
