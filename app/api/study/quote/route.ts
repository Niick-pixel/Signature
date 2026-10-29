import { NextResponse } from 'next/server';
import { lessonQuotes } from '@/db/study';
import { quoteOfDay } from '@/lib/study';

/** GET ?day&source=classic|mine|both — the quote of the day (the same all day). Custom lines come from Settings. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') ?? '') ? q.get('day')! : new Date().toLocaleDateString('en-CA');
  const source = q.get('source') === 'mine' ? 'mine' : q.get('source') === 'classic' ? 'classic' : 'both';
  const custom = (q.getAll('custom')).map((t) => t.slice(0, 300)).filter(Boolean).map((text) => ({ text, by: 'your own words' }));
  return NextResponse.json({ quote: quoteOfDay(day, source, source === 'classic' ? [] : lessonQuotes(), custom) });
}
