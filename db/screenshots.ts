import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SCREENSHOTS_DIR } from '../lib/paths';
import { localDay } from '../lib/day';
import { compressChart, getShotCompress } from './shotCompress';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

export const ACCEPTED_MIME = Object.keys(EXT_BY_MIME);

/**
 * Written beside the target and renamed into place, so a crash mid-write
 * leaves a stray .tmp, never a truncated chart that a trade points at.
 */
export function writeAtomic(absolute: string, data: Buffer): void {
  const tmp = `${absolute}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, absolute);
}
export const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;

/**
 * Writes an image to ./data/screenshots and returns the *relative* filename to
 * store in the database. Bytes never go into SQLite.
 *
 * Files are foldered by month so a few thousand trades stay browsable in Finder.
 */
export async function saveScreenshot(file: File): Promise<string> {
  if (!EXT_BY_MIME[file.type]) {
    throw new Error(`Unsupported image type: ${file.type || 'unknown'}`);
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    throw new Error('Image is larger than 25 MB.');
  }

  // Re-encoded only when you turned that on (Settings) and it saves space.
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  let ext = EXT_BY_MIME[file.type];
  const smaller = await compressChart(bytes, file.type, getShotCompress());
  if (smaller) { bytes = smaller; ext = '.webp'; }

  // Folder and name from the same local day — the name used the UTC date, so
  // an evening chart on the 31st was filed as 2026-10/2026-11-01-….
  const day = localDay();
  const folder = day.slice(0, 7);
  const name = `${day}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const relative = path.posix.join(folder, name);

  const absolute = path.join(SCREENSHOTS_DIR, folder, name);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  writeAtomic(absolute, bytes);

  return relative;
}

/**
 * Resolves a stored relative path to an absolute one, refusing anything that
 * escapes the screenshots directory.
 */
export function resolveScreenshot(relative: string): string {
  const absolute = path.resolve(SCREENSHOTS_DIR, relative);
  const root = path.resolve(SCREENSHOTS_DIR);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error('Refusing to read outside the screenshots directory.');
  }
  return absolute;
}

/** Best-effort cleanup when a trade is deleted. A missing file is not an error. */
export function deleteScreenshot(relative: string): void {
  // A quick log has no chart; '' would resolve to the screenshots folder itself.
  if (!relative) return;
  try {
    fs.rmSync(resolveScreenshot(relative), { force: true });
  } catch {
    /* the row is going away regardless */
  }
}

/**
 * Puts back a chart from an export, at the path its rows already name. Never
 * replaces a file that is there, never writes outside the screenshots folder.
 */
export function restoreScreenshotFile(relative: string, data: Buffer): boolean {
  let absolute: string;
  try { absolute = resolveScreenshot(relative); } catch { return false; }
  if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(absolute) || fs.existsSync(absolute)) return false;
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  writeAtomic(absolute, data);
  return true;
}
