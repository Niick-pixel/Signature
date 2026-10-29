import { TitleBar } from '@/components/shell/TitleBar';
import { AnalyticsView } from '@/components/analytics/AnalyticsView';
import type { AnalyticsTab } from '@/lib/preferences';

// lib/preferences is a client module: a server page gets a reference, not the array, so the tabs are listed here.
const TABS: readonly AnalyticsTab[] = ['time', 'confluences', 'psychology', 'mistakes', 'whatif', 'tilt', 'news', 'ask'];

export const dynamic = 'force-dynamic';

/** Analytics: the time of day, the confluences that pay, psychology, the news week, and Ask your journal. */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <AnalyticsView initialTab={(TABS as readonly string[]).includes(tab ?? '') ? tab as AnalyticsTab : null} />
      </div>
    </div>
  );
}
