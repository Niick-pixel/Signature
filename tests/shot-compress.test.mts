import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'signature-compress-'));
process.env.SIGNATURE_DATA_DIR = DIR;
process.env.SIGNATURE_MIGRATIONS_DIR = path.resolve('db/migrations');

const { getDb } = await import('../db/index');
const { saveScreenshot } = await import('../db/screenshots');
const { setShotCompress, getShotCompress, compressChart } = await import('../db/shotCompress');

/** A flat 400×300 PNG stored without compression — big on disk, tiny as WebP. */
function flatPng(): Buffer {
  const w = 400, h = 300;
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}
const save = (bytes: Buffer) => saveScreenshot(new File([new Uint8Array(bytes)], 'c.png', { type: 'image/png' }));

let hasSharp = true;
try { await import('sharp'); } catch { hasSharp = false; }

test('off by default: a chart is saved exactly as pasted', async () => {
  getDb();
  assert.equal(getShotCompress(), 'off');
  const png = flatPng();
  const rel = await save(png);
  assert.match(rel, /\.png$/);
  assert.deepEqual(fs.readFileSync(path.join(DIR, 'screenshots', rel)), png);
});

test('lossless: stored as WebP when smaller, same pixels', { skip: !hasSharp && 'sharp not installed' }, async () => {
  setShotCompress('lossless');
  const png = flatPng();
  const rel = await save(png);
  assert.match(rel, /\.webp$/);
  const out = fs.readFileSync(path.join(DIR, 'screenshots', rel));
  assert.ok(out.length < png.length / 10, `${out.length} vs ${png.length}`);
  const sharp = (await import('sharp')).default;
  const a = await sharp(png).raw().toBuffer();
  const b = await sharp(out).removeAlpha().raw().toBuffer();
  assert.ok(a.equals(b), 'pixel for pixel');
});

test('never kept when it is not smaller; GIF and WebP left alone', async () => {
  assert.equal(await compressChart(Buffer.from('not an image'), 'image/png', 'lossless'), null);
  assert.equal(await compressChart(flatPng(), 'image/gif', 'smaller'), null);
  assert.equal(await compressChart(flatPng(), 'image/png', 'off'), null);
});
