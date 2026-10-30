/* Whiteboard arrangements: zones by size, order kept, symmetric, never overlapping. */
import test from 'node:test';
import assert from 'node:assert/strict';
const { arrange, ARRANGEMENTS, arrangedKey } = await import('../lib/layout');

const box = (w: number, h: number) => ({ width: w, height: h });
const overlap = (a: { x: number; y: number }, ga: { width: number; height: number }, b: { x: number; y: number }, gb: { width: number; height: number }) =>
  a.x < b.x + gb.width && b.x < a.x + ga.width && a.y < b.y + gb.height && b.y < a.y + ga.height;

// Like the board in the screenshot: three small groups, two big, one medium.
const grids = [box(230, 170), box(230, 170), box(230, 170), box(450, 280), box(450, 280), box(450, 280)];
const sizes = [1, 1, 1, 23, 7, 2];

test('orbit: the two biggest left and right of the hub, the next below, the smallest on top, mirrored', () => {
  const p = arrange('orbit', grids, sizes)!;
  const [a, b, c, big1, big2, med] = p.at;
  assert.ok(big1.x + grids[3].width <= p.hub.x - 150 && big2.x >= p.hub.x + 150, 'sides');
  assert.ok(Math.abs((big1.x + grids[3].width / 2) + (big2.x + grids[4].width / 2)) < 1e-6, 'mirrored about the hub');
  assert.ok(med.y > p.hub.y + 65, 'medium below');
  for (const t of [a, b, c]) assert.ok(t.y + 170 < p.hub.y - 65, 'small on top');
  assert.ok(a.x < b.x && b.x < c.x, 'order kept inside the zone');
  assert.ok(Math.abs((a.x + c.x + 230) / 2 - p.hub.x) < 1e-6, 'top row centred');
});

test('every arrangement: no two groups overlap, at any count', () => {
  for (const kind of ARRANGEMENTS.filter((k) => k !== 'grid')) {
    for (const n of [1, 2, 3, 5, 6, 9, 14]) {
      const gs = Array.from({ length: n }, (_, i) => box(230 + (i % 3) * 110, 170 + (i % 2) * 110));
      const sz = gs.map((_, i) => (i * 7) % 11);
      const p = arrange(kind, gs, sz)!;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(!overlap(p.at[i], gs[i], p.at[j], gs[j]), `${kind} n=${n}: ${i} and ${j} overlap`);
    }
  }
});

test('big → small ranks by size, ties keep their order; grid is left alone; nudges kept per arrangement', () => {
  const p = arrange('sizes', grids, sizes)!;
  assert.ok(p.at[3].y <= p.at[0].y, 'the biggest come first');
  assert.equal(arrange('grid', grids, sizes), null);
  assert.equal(arrangedKey('A', 'grid'), 'A');
  assert.equal(arrangedKey('A', 'orbit'), 'A#orbit');
});
