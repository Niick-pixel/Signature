import { TitleBar } from '@/components/shell/TitleBar';
import { boardPage } from '@/db/statsBoard';
import { StatsBoard } from '@/components/dashboard/stats/StatsBoard';

export const dynamic = 'force-dynamic';

/**
 * Stats: a board of widgets over the Edge Engine (db/statsBoard,
 * lib/dashboard). The page never scrolls; each board fits the window.
 */
export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = boardPage(await searchParams);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TitleBar />
      <div className="signature-enter flex min-h-0 flex-1 flex-col">
        <StatsBoard page={page} />
      </div>
    </div>
  );
}
