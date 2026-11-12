import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DASH_ROW, parseDashRow, withProcess } from '../lib/preferences.ts';

test('the bottom row: old switches carry over, junk and duplicates are dropped, four at most', () => {
  assert.deepEqual(parseDashRow(undefined), DEFAULT_DASH_ROW);
  // Before it was modular: the prop block switched off stays off.
  assert.deepEqual(parseDashRow(undefined, { prop: false }).map((s) => s.id), ['score', 'process', 'recent']);
  assert.deepEqual(parseDashRow([{ id: 'month', size: 1 }, { id: 'nope', size: 2 }, { id: 'month', size: 2 }, { id: 'goals', size: 7 }]),
    [{ id: 'month', size: 1 }, { id: 'goals', size: 2 }]);
  assert.equal(parseDashRow(['score', 'recent', 'prop', 'study', 'goals', 'news'].map((id) => ({ id, size: 1 }))).length, 4);
  assert.deepEqual(parseDashRow([]), []);
});

test('the process heatmap joins a saved row once: after the score, only when there is room', () => {
  const ids = (r: Array<{ id: string }>) => r.map((s) => s.id);
  assert.deepEqual(ids(withProcess([{ id: 'score', size: 2 }, { id: 'recent', size: 2 }, { id: 'prop', size: 1 }])), ['score', 'process', 'recent', 'prop']);
  assert.deepEqual(ids(withProcess([{ id: 'recent', size: 2 }])), ['process', 'recent'], 'no score: first');
  const full = (['score', 'recent', 'prop', 'study'] as const).map((id) => ({ id, size: 1 as const }));
  assert.deepEqual(withProcess(full), full, 'a full row is left alone');
  const has = [{ id: 'process' as const, size: 1 as const }];
  assert.deepEqual(withProcess(has), has, 'already there');
});
