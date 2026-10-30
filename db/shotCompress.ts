import 'server-only';
import { getDb } from './index';

/*
  Optional compression of new charts.

  Off by default: a chart is evidence, and nothing should touch it unless you
  ask. "Lossless" re-encodes PNG/JPEG as lossless WebP — pixel for pixel the
  same, usually much smaller for platform screenshots. "Smaller" uses WebP at
  quality 90 — visually the same, smaller still. Either way the WebP is kept
  only when it actually saves space, and old charts are never rewritten.
*/
export type ShotCompress = 'off' | 'lossless' | 'smaller';
export const SHOT_COMPRESS: readonly ShotCompress[] = ['off', 'lossless', 'smaller'];

export function getShotCompress(): ShotCompress {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = 'shot_compress'").get() as { value: string } | undefined;
  return (SHOT_COMPRESS as readonly string[]).includes(row?.value ?? '') ? (row!.value as ShotCompress) : 'off';
}

export function setShotCompress(v: ShotCompress): void {
  getDb().prepare("INSERT INTO app_settings (key, value) VALUES ('shot_compress', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(v);
}

type Sharp = (input: Buffer) => { rotate: () => ReturnType<Sharp>; webp: (o: { quality?: number; lossless?: boolean; effort?: number }) => ReturnType<Sharp>; toBuffer: () => Promise<Buffer> };
let sharp: Sharp | null | undefined;

/** The chart re-encoded as WebP when that is asked for and smaller; otherwise null (keep the original). */
export async function compressChart(data: Buffer, mime: string, mode: ShotCompress): Promise<Buffer | null> {
  if (mode === 'off' || (mime !== 'image/png' && mime !== 'image/jpeg')) return null;
  if (sharp === undefined) {
    try { sharp = (await import('sharp')).default as unknown as Sharp; } catch { sharp = null; }
  }
  if (!sharp) return null;
  try {
    const out = await sharp(data).rotate().webp(mode === 'lossless' ? { lossless: true, effort: 4 } : { quality: 90, effort: 4 }).toBuffer();
    return out.length < data.length ? out : null;
  } catch {
    return null;
  }
}
