import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { BACKGROUNDS_DIR } from '@/lib/paths';
import { BG_TYPES } from '@/lib/backgrounds';

/** A file name only — no folders, no way out of the backgrounds folder. */
function resolve(name: string): string | null {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{3,4}$/i.test(name)) return null;
  const full = path.join(BACKGROUNDS_DIR, name);
  return fs.existsSync(full) && BG_TYPES[path.extname(name).toLowerCase()] ? full : null;
}

/** Serves a background; videos honour Range so they loop and seek smoothly. */
export async function GET(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const full = resolve(name);
  if (!full) return new NextResponse('Not found', { status: 404 });
  const type = BG_TYPES[path.extname(full).toLowerCase()];
  const size = fs.statSync(full).size;
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '');
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' };
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = Math.min(size - 1, range[2] ? Number(range[2]) : start + 4 * 1024 * 1024 - 1);
    if (start >= size || end < start) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const buf = Buffer.alloc(end - start + 1);
    const fd = fs.openSync(full, 'r'); fs.readSync(fd, buf, 0, buf.length, start); fs.closeSync(fd);
    return new NextResponse(new Uint8Array(buf), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(buf.length) } });
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(full)), { headers: { ...headers, 'Content-Length': String(size) } });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const full = resolve(name);
  if (full) fs.unlinkSync(full);
  return NextResponse.json({ ok: true });
}
