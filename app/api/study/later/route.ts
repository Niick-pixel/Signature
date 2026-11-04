import { NextResponse } from 'next/server';
import { addWatchLater, deleteWatchLater, listWatchLater, startWatching } from '@/db/studyHub';
import { cleanUrl } from '@/lib/study';

export async function GET() {
  return NextResponse.json({ items: listWatchLater() });
}

/** POST { url, title?, why? } */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const url = cleanUrl(b.url);
  if (!url) return NextResponse.json({ error: 'A web link (http or https).' }, { status: 400 });
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return NextResponse.json({ item: addWatchLater(url, s(b.title, 200), s(b.why, 1000)) }, { status: 201 });
}

/** PATCH { id, action: 'start' } — makes the video note and takes it off the list. */
export async function PATCH(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.id !== 'string' || b.action !== 'start') return NextResponse.json({ error: 'id and action: start' }, { status: 400 });
  const r = startWatching(b.id);
  return r ? NextResponse.json(r) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id' }, { status: 400 });
  deleteWatchLater(id);
  return NextResponse.json({ ok: true });
}
