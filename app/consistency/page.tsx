import { TitleBar } from '@/components/shell/TitleBar';
import { ConsistencyView } from '@/components/consistency/ConsistencyView';

export const dynamic = 'force-dynamic';

/** Consistency: the process, day by day — rings, the fair streak, the weekly report, the month. */
export default async function ConsistencyRoute({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[var(--page-read)] px-6 pb-20 pt-4">
          <ConsistencyView initialWeek={week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : null} />
        </div>
      </div>
    </div>
  );
}
