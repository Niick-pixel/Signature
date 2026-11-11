/* /api/stats-board: saving a layout (repaired, a broken one refused), boards (create, rename, duplicate, reorder, reset, delete), export/import, the gallery's previews. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-board-api-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { GET, POST } = await import('../app/api/stats-board/route');
const { boardPage } = await import('../db/statsBoard');
const { registry } = await import('../lib/dashboard/catalog');
const { DEFAULT_BOARDS } = await import('../lib/dashboard/defaults');

const post = async (body: Record<string, unknown>) => { const r = await POST(new Request('http://x/api/stats-board', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, json: await r.json() as Record<string, unknown> }; };
const ov = () => boardPage({ board: 'stats' }).board;

test('a layout save: a sound one is stored; overlap, an unknown widget or a size it lacks is refused', async () => {
  boardPage({});
  const l = structuredClone(ov().layout);
  l.tiles[0].items[0].cfg = { title: 'My line' };
  assert.equal((await post({ action: 'layout', board: 'stats', layout: l })).status, 200);
  assert.equal(ov().layout.tiles[0].items[0].cfg.title, 'My line');

  const overlap = structuredClone(l); overlap.tiles[1].x = 0; overlap.tiles[1].y = 0;
  const r = await post({ action: 'layout', board: 'stats', layout: overlap });
  assert.equal(r.status, 200, 'an overlap is repaired (pushed down), as a stored board would be');
  assert.ok((r.json.layout as { tiles: unknown[] }).tiles.length === l.tiles.length);

  const unknown = structuredClone(l); unknown.tiles[0].items.push({ uid: 'z', widget: 'no-such-widget', cfg: {} });
  assert.equal((await post({ action: 'layout', board: 'stats', layout: unknown })).status, 400);
});

test('boards: create (empty or a copy), rename, duplicate, reorder, reset, delete — never the last one', async () => {
  const empty = (await post({ action: 'create', name: 'Mine' })).json.id as string;
  assert.equal(boardPage({ board: empty }).board.layout.tiles.length, 0);
  const copy = (await post({ action: 'create', name: 'Copy', from: 'stats' })).json.id as string;
  assert.equal(boardPage({ board: copy }).board.layout.tiles.length, DEFAULT_BOARDS.find((b) => b.id === 'stats')!.layout.tiles.length);
  assert.equal((await post({ action: 'rename', board: copy, name: '  ' })).status, 400);
  await post({ action: 'rename', board: copy, name: 'My flaws' });
  const dup = (await post({ action: 'duplicate', board: copy })).json.id as string;
  assert.equal(boardPage({ board: dup }).board.name, 'My flaws copy');

  const ids = boardPage({}).boards.map((b) => b.id);
  await post({ action: 'reorder', ids: [dup, ...ids.filter((i) => i !== dup)] });
  assert.equal(boardPage({}).boards[0].id, dup);

  // Reset: a default board goes back exactly; your own has nothing to go back to.
  await post({ action: 'reset', board: 'stats' });
  assert.deepEqual(ov().layout, DEFAULT_BOARDS[0].layout);
  assert.equal((await post({ action: 'reset', board: copy })).status, 409);

  for (const b of boardPage({}).boards.slice(1)) await post({ action: 'delete', board: b.id });
  assert.equal(boardPage({}).boards.length, 1);
  assert.equal((await post({ action: 'delete', board: boardPage({}).boards[0].id })).status, 409);
});

test('export a board as a file and import it back as a new board', async () => {
  const id = boardPage({}).boards[0].id;
  const r = await GET(new Request(`http://x/api/stats-board?export=${id}`));
  assert.match(r.headers.get('Content-Disposition') ?? '', /attachment; filename="signature-board-/);
  const file = await r.json();
  const back = await post({ action: 'import', file });
  assert.equal(back.status, 200);
  assert.notEqual(back.json.id, id);
  assert.equal((await post({ action: 'import', file: { format: 'nope' } })).status, 400);
});

test('the gallery: a preview for every widget in the catalog', async () => {
  const r = await GET(new Request(`http://x/api/stats-board?preview=${boardPage({}).boards[0].id}`));
  const previews = await r.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(previews).sort(), registry.all().map((d) => d.id).sort());
});
