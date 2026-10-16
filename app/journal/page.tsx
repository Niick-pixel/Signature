import { listJournalPages } from '@/db/journal';
import { listTrades } from '@/db/trades';
import { TitleBar } from '@/components/shell/TitleBar';
import { JournalBook } from '@/components/journal/JournalBook';
import { ReviewExport } from '@/components/money/ReviewExport';
import { JOURNAL_RANGES } from '@/lib/journalExport';
import type { DayTradeSummary } from '@/components/journal/DayStrip';
import { isBacktest } from '@/lib/domain';

export const dynamic = 'force-dynamic';

/**
 * The journal proper — writing with no trade attached to it.
 *
 * Wider than the review screens and narrower than the board: a page of prose
 * wants a readable measure, and the spine beside it wants to show enough of
 * each entry to be recognised.
 */
export default async function JournalRoute({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: openPage } = await searchParams;
  const pages = listJournalPages();

  /*
    The day's trades, per day, slimmed to what the strip draws.

    Passing whole Trade rows would ship every explanation and lesson in the
    database to the client to render a row of chips — a hundred trades is a
    hundred pairs of 160-character essays crossing the boundary for nothing.
  */
  const byDay: Record<string, DayTradeSummary[]> = {};
  for (const t of listTrades()) {
    // The journal's days are days lived; a backtest's date is a replayed chart's.
    if (isBacktest(t.account)) continue;
    const day = t.date.slice(0, 10);
    (byDay[day] ??= []).push({
      id: t.id,
      time: new Date(t.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      reason: t.reason,
      instrument: t.instrument,
      direction: t.direction,
      setup_type: t.setup_type,
      outcome: t.outcome,
      r_multiple: t.r_multiple,
      pnl_dollars: t.pnl_dollars,
      grade_letter: t.grade_letter,
      mistake_tags: t.mistake_tags,
    });
  }
  for (const list of Object.values(byDay)) list.sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[82rem] px-6 pb-16 pt-4 lg:pb-6">
          {/* Above the book, so the export menu opens over it: the page's
              entrance animation makes each section its own layer, and a
              later layer would otherwise paint over the menu. */}
          <header className="relative z-20 mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">Journal</h1>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
                Not about one trade. Ideas, a summary of a week, something noticed on a Tuesday.
                Nothing here is required and nothing is scored.
              </p>
            </div>
            {/* The writing, handed to Claude to talk through — with the days it was written on. */}
            <ReviewExport
              label="the journal"
              title="Discuss the journal with Claude"
              blurb="Your pages in order, each with the day it was written on — the morning, the chart prep, the trades and their lessons — plus what to look for. Attach it to a new Claude chat."
              options={JOURNAL_RANGES.map((r) => ({ href: `/api/journal-export?range=${r.id}`, title: r.label, note: `.md — ${r.note}` }))}
            />
          </header>

          <JournalBook key={openPage ?? 'latest'} initial={pages} tradesByDay={byDay} openPage={openPage ?? null} />
        </div>
      </div>
    </div>
  );
}
