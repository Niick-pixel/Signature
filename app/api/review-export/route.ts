import fs from 'node:fs';
import path from 'node:path';
import { listTrades } from '@/db/trades';
import { listCashEvents } from '@/db/cash';
import { listJournalPages } from '@/db/journal';
import { listDailyReviews, listWeeklyReviews } from '@/db/reviews';
import { shotsForMany } from '@/db/shots';
import { SCREENSHOTS_DIR } from '@/lib/paths';
import { makeZip } from '@/lib/zip';
import { monthlyReview } from '@/lib/monthly';
import { listEvents } from '@/db/path';
import { listPreps } from '@/db/prep';
import { isBacktest } from '@/lib/domain';

/**
 * One month, written for a review conversation with Claude.
 *
 * ?format=md is the document alone. ?format=zip adds every chart from the
 * month, named after the trade it belongs to, so the images can be attached
 * alongside and matched up. Nothing leaves the machine: this is a download.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const month = q.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json({ error: 'Expected ?month=YYYY-MM.' }, { status: 400 });
  }
  const format = q.get('format') === 'zip' ? 'zip' : 'md';

  // The month lived: backtests replay other months and have their own stats page.
  const trades = listTrades().filter((t) => !isBacktest(t.account));
  const inMonth = trades.filter((t) => t.date.slice(0, 7) === month);

  const review = monthlyReview({
    month,
    trades,
    reviews: listDailyReviews(),
    weekly: listWeeklyReviews(),
    pages: listJournalPages(),
    cash: listCashEvents(),
    shots: shotsForMany(inMonth.map((t) => t.id)),
    preps: listPreps(),
    pathEvents: listEvents(),
  });

  if (format === 'md') {
    return new Response(review.markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${review.filename}.md"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const files = [{ name: `${review.filename}.md`, data: Buffer.from(review.markdown, 'utf8') }];
  for (const chart of review.charts) {
    const abs = path.resolve(SCREENSHOTS_DIR, chart.source);
    // A missing chart must not sink the month — the text is the review.
    if (!abs.startsWith(path.resolve(SCREENSHOTS_DIR) + path.sep) || !fs.existsSync(abs)) continue;
    files.push({ name: chart.name, data: fs.readFileSync(abs) });
  }
  return new Response(new Uint8Array(makeZip(files)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${review.filename}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
