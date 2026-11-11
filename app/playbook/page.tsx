import { InTitleBar, MergedHeader } from '@/components/shell/TitleSlot';
import { listPlaybooks } from '@/db/reviews';
import { listTrades } from '@/db/trades';
import { TitleBar } from '@/components/shell/TitleBar';
import { PlaybookList } from '@/components/review/PlaybookList';
import { aggregate } from '@/lib/stats';

export const dynamic = 'force-dynamic';

/**
 * Named setups, and whether they actually pay.
 *
 * "iFVG" covers a dozen different trades. Naming them individually is the only
 * way to find out that three of them make all the money and the rest are a
 * hobby.
 */
export default function PlaybookPage() {
  const trades = listTrades();
  const books = listPlaybooks().map((book) => {
    const mine = trades.filter((t) => t.playbook_id === book.id);
    return { book, stats: aggregate(mine) };
  });

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[52rem] px-6 pb-20 pt-4">
          <InTitleBar
            merged={<MergedHeader title={<>Playbook</>} sub={<>Name the setups you actually trade, then find out which of them pay. A setup with
              fewer than twenty trades behind it is a hypothesis, not an edge.</>} data="playbook">
            </MergedHeader>}
            inline={<>
          <header className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight">Playbook</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
              Name the setups you actually trade, then find out which of them pay. A setup with
              fewer than twenty trades behind it is a hypothesis, not an edge.
            </p>
          </header>
            </>} />
          <PlaybookList entries={books} />
        </div>
      </div>
    </div>
  );
}
