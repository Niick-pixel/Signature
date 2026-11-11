/* Two APIs with similar names, each with its own job: the home Dashboard's filtered views (GET) and the Stats board's changes (POST). */
import test from 'node:test';
import assert from 'node:assert/strict';

test('/api/dashboard serves the Dashboard tab (GET); /api/stats-board changes Stats boards (POST)', async () => {
  const dash = await import('../app/api/dashboard/route');
  assert.equal(typeof (dash as Record<string, unknown>).GET, 'function', 'the Dashboard tab filters through GET /api/dashboard');
  const board = await import('../app/api/stats-board/route');
  assert.equal(typeof (board as Record<string, unknown>).POST, 'function');
});
