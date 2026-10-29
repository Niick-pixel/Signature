import { NextResponse } from 'next/server';
import { getNewsSettings, listNews, syncForexFactory } from '@/db/news';
import { newsAnswer, sessionNews } from '@/lib/news';
import { nyMinutes } from '@/lib/planMatch';

/**
 * GET ?day= — the red and orange releases inside the session window that
 * day (New York time), and the chart prep's News answer from them. Pulls
 * ForexFactory first when the feed is on and the last pull is stale.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') ?? '') ? q.get('day')! : new Date().toLocaleDateString('en-CA');
  let s = getNewsSettings();
  let error: string | undefined;
  if (s.ffAuto) { const r = await syncForexFactory(false); error = r.error; s = getNewsSettings(); }
  const events = sessionNews(listNews(day, day), day, s.currencies, s.window, nyMinutes);
  return NextResponse.json({ events, answer: newsAnswer(events, nyMinutes), window: s.window, currencies: s.currencies, auto: s.ffAuto, syncedAt: s.syncedAt, error });
}
