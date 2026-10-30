import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-open-'));
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');
const { getDb } = await import('../db/index');

test('the journal waits for a lock instead of failing at once', () => {
  const row = getDb().prepare('PRAGMA busy_timeout').get() as Record<string, number>;
  assert.equal(Object.values(row)[0], 3000);
});
