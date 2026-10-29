import { NextResponse } from 'next/server';
import { lessonQuotes } from '@/db/study';
import { TIPS, TRADER_QUOTES, lineOfDay } from '@/lib/quotes';

/**
 * GET ?day&source=traders|quotes|tips|mine|all&custom= — today's line. It
 * walks the whole pool before anything repeats.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') ?? '') ? q.get('day')! : new Date().toLocaleDateString('en-CA');
  const source = q.get('source') ?? 'traders';
  const custom = q.getAll('custom').map((t) => t.slice(0, 300)).filter(Boolean).map((text) => ({ text, by: 'your own words' }));
  const pool = [
    ...(['traders', 'quotes', 'all'].includes(source) ? TRADER_QUOTES : []),
    ...(['traders', 'tips', 'all'].includes(source) ? TIPS : []),
    ...(['mine', 'all'].includes(source) ? lessonQuotes() : []),
    ...custom,
  ];
  return NextResponse.json({ quote: lineOfDay(day, pool) });
}
