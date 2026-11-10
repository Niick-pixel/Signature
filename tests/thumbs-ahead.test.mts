/* Thumbnails made ahead: every size of a new chart in the background, and a one-time catch-up for older ones. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SIGNATURE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-thumbs-'));
const { default: sharp } = await import('sharp');
const T = await import('../db/thumbs');
const { SCREENSHOTS_DIR, THUMBS_DIR } = await import('../lib/paths');

const chart = async (rel: string) => {
  const abs = path.join(SCREENSHOTS_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  await sharp({ create: { width: 2000, height: 1100, channels: 3, background: { r: 30, g: 140, b: 90 } } }).png().toFile(abs);
  return { absolute: abs, relative: rel };
};
const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 25)); };

test('a new chart gets its small sizes in the background', async () => {
  const c = await chart('2026-11/a.png');
  assert.equal(T.hasThumbnails(c.relative), false);
  T.warmThumbnails(c.absolute, c.relative);
  await until(() => T.hasThumbnails(c.relative));
  for (const w of T.AHEAD_WIDTHS) {
    const meta = await sharp(path.join(THUMBS_DIR, String(w), `${c.relative}.webp`)).metadata();
    assert.equal(meta.width, w, `the ${w} copy`);
  }
});

test('the catch-up queues only charts missing a size, once per run', async () => {
  const done = await chart('2026-11/a.png'); // made above
  T.warmThumbnails(done.absolute, done.relative);
  await until(() => T.hasThumbnails(done.relative));
  const b = await chart('2026-11/b.png');
  const gone = { absolute: path.join(SCREENSHOTS_DIR, 'nope.png'), relative: 'nope.png' };
  assert.equal(T.catchUpThumbnails([done, b, gone]), 1, 'only b: a has its copies, the missing file is skipped');
  await until(() => T.hasThumbnails(b.relative));
  assert.ok(T.hasThumbnails(b.relative));
  assert.equal(T.catchUpThumbnails([await chart('2026-11/c.png')]), 0, 'a second catch-up in the same run does nothing');
});
