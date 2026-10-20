import { NextResponse } from 'next/server';
import { createJournalPage, listJournalPages, parseJournalInput } from '@/db/journal';
import { reviewInputs } from '@/db/review';
import { mondayOfDay } from '@/lib/review';
import { weekReview, weekReviewHtml } from '@/lib/weekly';

/**
 * POST { day } — this week's review page, pre-written, on any day: the
 * numbers, patterns, rules broken, best and worst trade, and headings to
 * fill. Returns the page already written for the week, if there is one.
 */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null) as { day?: unknown } | null;
  const day = typeof b?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null;
  if (!day) return NextResponse.json({ error: 'Which day?' }, { status: 400 });
  const monday = mondayOfDay(day);
  const title = `Week so far · week of ${monday}`;
  const existing = listJournalPages().find((p) => p.title === title);
  if (existing) return NextResponse.json({ pageId: existing.id });
  const { trades, ctxFor, cfg } = reviewInputs();
  const w = weekReview(trades, monday, ctxFor, cfg);
  const body = [
    weekReviewHtml(w),
    '<h2>What I will keep doing</h2><p></p>',
    '<h2>What I will change</h2><p></p>',
    `<h2>One rule for next week</h2><p>${w.next.ifThen ? w.next.ifThen.replace(/&/g, '&amp;').replace(/</g, '&lt;') : 'If … then …'}</p>`,
  ].join('');
  const parsed = parseJournalInput({ day, title, body });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return NextResponse.json({ pageId: createJournalPage(parsed.value).id }, { status: 201 });
}
