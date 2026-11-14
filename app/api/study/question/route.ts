import { NextResponse } from 'next/server';
import { answerToday, todaysQuestion } from '@/db/dailyQuestion';

const dayOf = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toLocaleDateString('en-CA'));

/** GET ?today — today's question (its answer only once answered), the stats, the last week's questions. */
export async function GET(request: Request) {
  return NextResponse.json(todaysQuestion(dayOf(new URL(request.url).searchParams.get('today'))));
}

/** POST { today, choice } — the day's one answer. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as { today?: unknown; choice?: unknown } | null;
  try {
    const day = dayOf(b?.today);
    answerToday(day, Number(b?.choice));
    return NextResponse.json(todaysQuestion(day));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save the answer.' }, { status: 400 });
  }
}
