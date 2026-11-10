import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { THUMBS_DIR } from '../lib/paths';

/** The widths a card may ask for. Anything else gets the original. */
/** 320 for the trade cards (light, quality 60), 480/720 for the group viewer and board, 1600 for the trade panel. */
export const THUMB_WIDTHS = [320, 480, 720, 1600] as const;

/** What is made ahead (background): the list's small sizes. 720 and 1600 are made when first asked for. */
export const AHEAD_WIDTHS = [320, 480] as const;

type Sharp = ((input: string) => {
  rotate: () => ReturnType<Sharp>;
  resize: (o: { width: number; withoutEnlargement: boolean }) => ReturnType<Sharp>;
  webp: (o: { quality: number }) => ReturnType<Sharp>;
  toBuffer: () => Promise<Buffer>;
}) & { concurrency?: (n: number) => number };
let sharp: Sharp | null | undefined;

/**
 * A card-sized copy of a screenshot, made once and kept in ./data/thumbs.
 *
 * The board showed every chart at full resolution — a 2560px capture decoded
 * to draw a card a few hundred pixels wide, twenty times over each time the
 * board appeared. A 720px WebP is a fraction of the bytes and of the decode.
 *
 * Returns null whenever it cannot (no image library on this machine, an
 * unreadable file): the caller then serves the original, which is exactly
 * how it worked before.
 */
export async function thumbnail(absolute: string, relative: string, width: number): Promise<Buffer | null> {
  const out = path.join(THUMBS_DIR, String(width), `${relative}.webp`);
  try {
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(absolute).mtimeMs) return fs.readFileSync(out);
  } catch { /* fall through and rebuild */ }

  if (sharp === undefined) {
    try {
      sharp = (await import('sharp')).default as unknown as Sharp;
      // Two threads, not every core: resizing runs beside the app, never instead of it.
      sharp.concurrency?.(2);
    } catch { sharp = null; }
  }
  if (!sharp) return null;
  try {
    const buf = await sharp(absolute).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: width <= 320 ? 60 : 78 }).toBuffer();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    return buf;
  } catch {
    return null;
  }
}

/*
  Made ahead, not on first view. A thumbnail used to be made the first time
  a card asked for it, so the first look at a group of forty charts started
  forty image resizes at once — seconds of half-drawn cards. Now each new
  chart gets its copies right after it is saved, and charts saved before
  this get theirs once, in the background, one at a time.
*/
const queue: Array<{ absolute: string; relative: string }> = [];
let draining = false;

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      for (const w of AHEAD_WIDTHS) {
        if (!fs.existsSync(job.absolute)) break;
        await thumbnail(job.absolute, job.relative, w);
      }
      // A breath between charts, so a request that arrives meanwhile is answered first.
      await new Promise((r) => setTimeout(r, 15));
    }
  } finally {
    draining = false;
  }
}

/** The small sizes of one chart, made in the background (fire and forget). */
export function warmThumbnails(absolute: string, relative: string): void {
  if (/\.gif$/i.test(relative)) return;
  queue.push({ absolute, relative });
  void drain();
}

/** True when the sizes made ahead already exist for this chart. */
export function hasThumbnails(relative: string): boolean {
  return AHEAD_WIDTHS.every((w) => fs.existsSync(path.join(THUMBS_DIR, String(w), `${relative}.webp`)));
}

let caughtUp = false;
/** Once per run: queue every chart that is missing a size. Returns how many were queued. */
export function catchUpThumbnails(charts: Array<{ absolute: string; relative: string }>): number {
  if (caughtUp) return 0;
  caughtUp = true;
  const missing = charts.filter((c) => !/\.gif$/i.test(c.relative) && !hasThumbnails(c.relative) && fs.existsSync(c.absolute));
  queue.push(...missing);
  void drain();
  return missing.length;
}
