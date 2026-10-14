/* Cached screens: a change marks them stale, and the next move loads fresh once. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshPush, markStale, takeStale } from '../lib/freshness';

test('freshPush refreshes only after a change, and only once', () => {
  takeStale();
  const calls: string[] = [];
  const router = { push: (h: string) => calls.push(`push ${h}`), refresh: () => calls.push('refresh') };
  freshPush(router, '/stats');
  markStale();
  freshPush(router, '/');
  freshPush(router, '/stats');
  assert.deepEqual(calls, ['push /stats', 'refresh', 'push /', 'push /stats']);
  assert.equal(takeStale(), false);
});
