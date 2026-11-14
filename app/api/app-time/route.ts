import { NextResponse } from 'next/server';
import { addAppTime, appTimeOn } from '@/db/appTime';

const dayOf = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** GET ?day — seconds in the app that day. */
export async function GET(request: Request) {
  const day = dayOf(new URL(request.url).searchParams.get('day'));
  if (!day) return NextResponse.json({ error: 'A day, YYYY-MM-DD.' }, { status: 400 });
  return NextResponse.json({ day, seconds: appTimeOn(day) });
}

/** POST { day, seconds } — a heartbeat from the tracker: seconds in use since the last one. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as { day?: unknown; seconds?: unknown } | null;
  const day = dayOf(b?.day);
  if (!day) return NextResponse.json({ error: 'A day, YYYY-MM-DD.' }, { status: 400 });
  return NextResponse.json({ day, seconds: addAppTime(day, Number(b?.seconds)) });
}
