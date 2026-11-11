import { listTrades } from '@/db/trades';
import { getWeeklyReview } from '@/db/reviews';
import { TitleBar } from '@/components/shell/TitleBar';
import { WeeklyReviewFlow } from '@/components/review/WeeklyReviewFlow';
import { RepeatedLessons } from '@/components/review/RepeatedLessons';
import { Panel } from '@/components/stats/Bars';
import { repeatedLessons } from '@/lib/lessons';
import { TAKE_IT_THRESHOLD } from '@/lib/domain';
import { hasOpenFlags } from '@/lib/flags';
import { isBacktest } from '@/lib/domain';

export const dynamic = 'force-dynamic';

/** Monday of the week containing `d`, as YYYY-MM-DD. */
export function mondayOf(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const shift = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - shift);
  return copy.toISOString().slice(0, 10);
}

/**
 * The week's trades worth arguing with, one at a time.
 *
 * Not every trade — the ones under the standard or carrying an unexplained
 * contradiction. A review that walks all forty is a review that gets abandoned
 * on the sixth.
 */
export default async function ReviewPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const asked = (await searchParams).week;
  const week = typeof asked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asked)
    ? asked : mondayOf(new Date());

  const end = new Date(`${week}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const endStr = end.toISOString().slice(0, 10);

  const all = listTrades();
  // The week lived — backtests replay other weeks, and are reviewed on their own.
  const inWeek = all.filter((t) => !isBacktest(t.account) && t.date.slice(0, 10) >= week && t.date.slice(0, 10) < endStr);
  const worthReviewing = inWeek.filter(
    (t) => t.checklist_score < TAKE_IT_THRESHOLD || hasOpenFlags(t),
  );

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[var(--page-read)] px-6 pb-20 pt-4">
          <WeeklyReviewFlow
            week={week}
            trades={worthReviewing}
            totalInWeek={inWeek.length}
            existing={getWeeklyReview(week)}
          />

          {/* Not the week's — every lesson ever written, because a repeat can
              be months apart and still be the same mistake. */}
          <div className="mt-8">
            <Panel
              title="Lessons you keep writing"
              note="Lessons from any date that share enough words to be the same lesson, written again. The words that matched are shown on each group, so you can judge the grouping yourself. Click any lesson to open its trade."
            >
              <RepeatedLessons groups={repeatedLessons(all.filter((t) => !isBacktest(t.account)))} />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
