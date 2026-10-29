import { NextResponse } from 'next/server';
import { addMark, deleteMark, getNote } from '@/db/study';
import { parseTimestamp } from '@/lib/study';

/** POST { at: "12:30", text } — a moment in the video. DELETE ?mark= — remove it. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getNote(id)) return NextResponse.json({ error: 'No such note.' }, { status: 404 });
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const seconds = typeof b.seconds === 'number' ? b.seconds : parseTimestamp(String(b.at ?? ''));
  if (seconds == null || seconds < 0) return NextResponse.json({ error: 'A time like 12:30 or 1:02:03.' }, { status: 400 });
  return NextResponse.json({ mark: addMark(id, seconds, typeof b.text === 'string' ? b.text.slice(0, 1000) : '') }, { status: 201 });
}

export async function DELETE(request: Request) {
  const mark = new URL(request.url).searchParams.get('mark');
  if (mark) deleteMark(mark);
  return NextResponse.json({ ok: true });
}
