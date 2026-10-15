import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { THUMBS_DIR } from '../lib/paths';

/** The widths a card may ask for. Anything else gets the original. */
/** 480/720 for cards and the group viewer, 1600 for the trade panel. */
export const THUMB_WIDTHS = [480, 720, 1600] as const;

type Sharp = (input: string) => {
  rotate: () => ReturnType<Sharp>;
  resize: (o: { width: number; withoutEnlargement: boolean }) => ReturnType<Sharp>;
  webp: (o: { quality: number }) => ReturnType<Sharp>;
  toBuffer: () => Promise<Buffer>;
};
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
    try { sharp = (await import('sharp')).default as unknown as Sharp; } catch { sharp = null; }
  }
  if (!sharp) return null;
  try {
    const buf = await sharp(absolute).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    return buf;
  } catch {
    return null;
  }
}
