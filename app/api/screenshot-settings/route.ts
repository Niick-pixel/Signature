import { NextResponse } from 'next/server';
import { SHOT_COMPRESS, getShotCompress, setShotCompress, type ShotCompress } from '@/db/shotCompress';

export const dynamic = 'force-dynamic';

/** How new charts are stored: as pasted (off), lossless WebP, or WebP at quality 90. */
export async function GET() {
  return NextResponse.json({ compress: getShotCompress() });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null) as { compress?: string } | null;
  if (!body || !(SHOT_COMPRESS as readonly string[]).includes(body.compress ?? '')) {
    return NextResponse.json({ error: 'compress must be off, lossless or smaller.' }, { status: 400 });
  }
  setShotCompress(body.compress as ShotCompress);
  return NextResponse.json({ compress: getShotCompress() });
}
