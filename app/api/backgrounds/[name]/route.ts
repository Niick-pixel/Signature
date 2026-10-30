import { NextResponse } from 'next/server';
import { backgroundFile, deleteBackground, readBackground } from '@/db/backgrounds';

/** Serves a background; videos honour Range so they loop and seek smoothly. */
export async function GET(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const bg = backgroundFile(name);
  if (!bg) return new NextResponse('Not found', { status: 404 });
  const { full, type, size } = bg;
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '');
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' };
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = Math.min(size - 1, range[2] ? Number(range[2]) : start + 4 * 1024 * 1024 - 1);
    if (start >= size || end < start) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const buf = readBackground(full, start, end);
    return new NextResponse(new Uint8Array(buf), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(buf.length) } });
  }
  return new NextResponse(new Uint8Array(readBackground(full)), { headers: { ...headers, 'Content-Length': String(size) } });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const bg = backgroundFile(name);
  if (bg) deleteBackground(bg.full);
  return NextResponse.json({ ok: true });
}
