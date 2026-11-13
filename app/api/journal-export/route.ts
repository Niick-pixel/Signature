import { listTrades } from '@/db/trades';
import { listReplayDays } from '@/db/replay';
import { listJournalPages } from '@/db/journal';
import { listDailyReviews } from '@/db/reviews';
import { listPreps } from '@/db/prep';
import { journalExport, type JournalRange } from '@/lib/journalExport';

/**
 * The journal as one Markdown document for a conversation with Claude:
 * ?range=30|90|all. A download — nothing leaves the machine by itself.
 */
export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get('range') ?? '30';
  const range: JournalRange = asked === '90' || asked === 'all' ? asked : '30';
  const doc = journalExport({
    range, pages: listJournalPages(), trades: listTrades(), reviews: listDailyReviews(), preps: listPreps(), replayDays: listReplayDays(),
  });
  return new Response(doc.markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${doc.filename}.md"`,
      'Cache-Control': 'no-store',
    },
  });
}
