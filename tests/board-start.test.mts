import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-board-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');
const { getDb } = await import('../db/index');
const { boardStart } = await import('../db/boardlayout');

test('board notes and links reach the page as plain objects (a null prototype crashed every screen)', () => {
  const db = getDb();
  db.prepare("INSERT INTO board_notes (id, body, x, y) VALUES ('n', 'wait for the close', 1, 2)").run();
  db.prepare("INSERT INTO board_edges (id, from_id, to_id) VALUES ('e', 'a', 'n')").run();
  const { notes, edges } = boardStart();
  assert.equal(notes.length, 1); assert.equal(edges.length, 1);
  for (const row of [...notes, ...edges]) assert.equal(Object.getPrototypeOf(row), Object.prototype);
});
