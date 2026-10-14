import { notFound } from 'next/navigation';
import { getTrade, listTrades } from '@/db/trades';
import { NewTradeForm } from '@/components/capture/NewTradeForm';
import { CaptureSheet } from '@/components/capture/CaptureSheet';
import { lessonsBySetup } from '@/lib/lessons';
import { isBacktest } from '@/lib/domain';

export const dynamic = 'force-dynamic';

/**
 * New trade (or ?edit=<id>), opened from inside the app: drawn over the
 * current screen instead of replacing it. A direct load of /new still gets
 * the full page in app/new.
 */
export default async function NewTradeSheet({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const trade = edit ? getTrade(edit) : null;
  if (edit && !trade) notFound();
  const trades = listTrades();
  return (
    <CaptureSheet>
      <NewTradeForm trade={trade ?? undefined}
        pastLessons={lessonsBySetup(trades.filter((t) => !isBacktest(t.account)), trade ?? undefined)}
        backtestLessons={lessonsBySetup(trades.filter((t) => isBacktest(t.account)), trade ?? undefined)} />
    </CaptureSheet>
  );
}
