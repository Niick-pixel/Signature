import { NextResponse } from 'next/server';
import { addSession, deleteSession, listSessions } from '@/db/study';
import { studyTotals } from '@/lib/study';

/** GET ?today&goal — study time: today, this week, the streak, the record, and recent sessions. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(q.get('today') ?? '') ? q.get('today')! : new Date().toLocaleDateString('en-CA');
  const goal = Math.max(1, Math.min(600, Number(q.get('goal')) || 20));
  const all = listSessions();
  return NextResponse.json({ totals: studyTotals(all, today, goal), recent: all.slice(-12).reverse() });
}

/** POST { day, minutes, note_id?, topic? } — a session from the study timer. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>;
  const day = typeof b.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null;
  const minutes = Number(b.minutes);
  if (!day || !Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) return NextResponse.json({ error: 'A session needs a day and minutes.' }, { status: 400 });
  return NextResponse.json({ session: addSession({ day, minutes: Math.round(minutes * 10) / 10, note_id: typeof b.note_id === 'string' ? b.note_id : null,
    topic: typeof b.topic === 'string' && b.topic.trim() ? b.topic.trim().slice(0, 120) : null }) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (id) deleteSession(id);
  return NextResponse.json({ ok: true });
}
