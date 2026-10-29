import { TitleBar } from '@/components/shell/TitleBar';
import { ReportsView } from '@/components/reports/ReportsView';

export const dynamic = 'force-dynamic';

const TABS = ['compare', 'breakdowns', 'fees', 'heatmap', 'tags'] as const;

/** Reports: compare two groups, breakdowns, fees, the rules heatmap, and your own tags. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <ReportsView initialTab={(TABS as readonly string[]).includes(tab ?? '') ? (tab as (typeof TABS)[number]) : 'compare'} />
      </div>
    </div>
  );
}
