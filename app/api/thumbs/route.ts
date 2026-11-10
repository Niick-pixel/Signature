import { NextResponse } from 'next/server';
import path from 'node:path';
import { listTrades } from '@/db/trades';
import { catchUpThumbnails } from '@/db/thumbs';
import { SCREENSHOTS_DIR } from '@/lib/paths';

/**
 * POST — make the card and panel copies of every chart that does not have
 * them yet, in the background, one at a time (db/thumbs). Asked once by the
 * trade library when it opens; a second call in the same run does nothing.
 */
export async function POST() {
  const charts = listTrades()
    .filter((t) => t.screenshot_path)
    .map((t) => ({ relative: t.screenshot_path, absolute: path.join(SCREENSHOTS_DIR, t.screenshot_path) }));
  return NextResponse.json({ queued: catchUpThumbnails(charts) });
}
