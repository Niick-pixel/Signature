import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { BACKGROUNDS_DIR } from '../lib/paths';
import { BG_TYPES } from '../lib/backgrounds';

/*
  File access for the app backgrounds, kept out of the route file: read there,
  the bundler could not tell the file apart from source and traced the whole
  project into the server build (three build warnings).
*/

/** A file name only — no folders, no way out of the backgrounds folder. */
export function backgroundFile(name: string): { full: string; type: string; size: number } | null {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{3,4}$/i.test(name)) return null;
  const type = BG_TYPES[path.extname(name).toLowerCase()];
  const full = path.join(BACKGROUNDS_DIR, name);
  if (!type || !fs.existsSync(full)) return null;
  return { full, type, size: fs.statSync(full).size };
}

export function readBackground(full: string, start?: number, end?: number): Buffer {
  if (start == null || end == null) return fs.readFileSync(full);
  const buf = Buffer.alloc(end - start + 1);
  const fd = fs.openSync(full, 'r');
  try { fs.readSync(fd, buf, 0, buf.length, start); } finally { fs.closeSync(fd); }
  return buf;
}

export function deleteBackground(full: string): void { fs.rmSync(full, { force: true }); }
