import { listTrades } from '@/db/trades';
import { getDailyReview } from '@/db/reviews';
import { TitleBar } from '@/components/shell/TitleBar';
import { DailyReviewForm } from '@/components/review/DailyReviewForm';
import { DayTrades } from '@/components/review/DayTrades';
import { localDay } from '@/lib/day';
import { isBacktest } from '@/lib/domain';

export const dynamic = 'force-dynamic';


/**
 * One record per trading day, independent of whether anything was traded.
 *
 * The bias and the levels are written before the session; what actually
 * happened is written after. Sleep and state of mind are here as correlation
 * data, not as a diary — the question they answer is whether five hours of
 * sleep is what actually breaks the rules.
 */
export default async function DayPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const asked = (await searchParams).day;
  // From the Backtest calendar: that day's backtests, and only those.
  const backtests = isBacktest((await searchParams).account as string | undefined);
  const day = typeof asked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : localDay();
  // Otherwise never a backtest: a day page is a day traded.
  const onDay = listTrades()
    .filter((t) => (backtests ? isBacktest(t.account) && !t.undated : !isBacktest(t.account)) && t.date.slice(0, 10) === day)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[var(--page-read)] space-y-5 px-6 pb-20 pt-4">
          {/*
            The trades first, the writing second. This page is what a calendar
            square opens into, and the square was showing a P&L — landing on a
            form that does not mention the trades is landing on the wrong page.
          */}
          <div className="glass rounded-[calc(28px*var(--rk))] p-7 sm:p-9">
            <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.07em]"
              style={{ color: 'var(--text-faint)' }}>
              {backtests ? 'Backtests on this day' : 'Trades on this day'}
            </h2>
            <DayTrades trades={onDay} />
          </div>

          {/* The daily review is about the day traded, not the day replayed. */}
          {!backtests && <DailyReviewForm day={day} existing={getDailyReview(day)} tradesOnDay={onDay.length} />}
        </div>
      </div>
    </div>
  );
}
