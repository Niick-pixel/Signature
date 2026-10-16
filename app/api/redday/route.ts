import { NextResponse } from 'next/server';
import { pendingRedDay, redDayStatus, writeRedDayPage } from '@/db/redDays';

/** ?today=YYYY-MM-DD (local): the red day to ask about, and the counts for the Path. */
export async function GET(request: Request) {
  const today = new URL(request.url).searchParams.get('today') ?? new Date().toLocaleDateString('en-CA');
  const s = redDayStatus();
  return NextResponse.json({ prompt: pendingRedDay(today), withPage: s.withPage, without: s.without });
}

/** Write the page for a red day; returns its id. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as { day?: unknown; world?: unknown } | null;
  const day = typeof b?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null;
  const world = b?.world === 'backtest' ? 'backtest' : b?.world === 'real' ? 'real' : null;
  if (!day || !world) return NextResponse.json({ error: 'Which day?' }, { status: 400 });
  const id = writeRedDayPage(day, world);
  if (!id) return NextResponse.json({ error: 'That day was not red.' }, { status: 404 });
  return NextResponse.json({ pageId: id }, { status: 201 });
}
