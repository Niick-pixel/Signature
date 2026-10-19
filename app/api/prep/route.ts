import { NextResponse } from 'next/server';
import { getPrep, previousPrep, savePrep, weekPrepsBefore } from '@/db/prep';
import { getDailyReview } from '@/db/reviews';
import { parsePrepData, weeklyTaken } from '@/lib/prep';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET ?day=YYYY-MM-DD — the day's prep, the most recent one before it (for
 * carrying levels forward), the weekly levels already taken this week, and
 * the morning check-in it builds on.
 */
export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get('day') ?? '';
  if (!DAY.test(day)) return NextResponse.json({ error: 'Expected ?day=YYYY-MM-DD.' }, { status: 400 });
  return NextResponse.json({
    prep: getPrep(day), previous: previousPrep(day), review: getDailyReview(day),
    weeklyTaken: weeklyTaken(weekPrepsBefore(day), day),
  });
}

/** PUT { day, data, complete? } — saved as the prep goes, a step at a time. */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null) as { day?: unknown; data?: unknown; complete?: unknown } | null;
  const day = typeof body?.day === 'string' ? body.day : '';
  if (!DAY.test(day)) return NextResponse.json({ error: 'Expected a day.' }, { status: 400 });
  return NextResponse.json(savePrep(day, parsePrepData(body?.data), body?.complete === true));
}
