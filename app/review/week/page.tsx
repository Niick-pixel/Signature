import { TitleBar } from '@/components/shell/TitleBar';
import { WeeklyReportView } from '@/components/review/WeeklyReportView';
import { reviewInputs } from '@/db/review';
import { listPreps } from '@/db/prep';
import { getWeeklyReview } from '@/db/reviews';
import { describeKey } from '@/lib/edge/flaws';
import { localDay } from '@/lib/day';
import { mondayOfDay } from '@/lib/review';
import { weeklyReport } from '@/lib/weeklyReport';

export const dynamic = 'force-dynamic';

/**
 * The weekly report (big update, #6): the week on one page, built from the journal — and your
 * paragraph. ?week=YYYY-MM-DD (any day of it); this week by default. Saved as a PDF from the page.
 */
export default async function WeeklyReportPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const asked = (await searchParams).week;
  const monday = mondayOfDay(typeof asked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : localDay());
  const { trades, ctxFor, cfg } = reviewInputs();
  const prepByDay = new Map(listPreps().map((p) => [p.day, p.data] as const));
  const report = weeklyReport(trades, monday, { ctxFor, cfg, prepByDay, drillTitle: (k) => describeKey(k).title });
  const saved = getWeeklyReview(monday);
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <WeeklyReportView report={report} note={saved?.summary ?? ''} reviewedIds={saved?.reviewed_ids ?? []} thisWeek={mondayOfDay(localDay()) === monday} />
      </div>
    </div>
  );
}
