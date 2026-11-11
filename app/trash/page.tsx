import { InTitleBar, MergedHeader } from '@/components/shell/TitleSlot';
import { listTrades } from '@/db/trades';
import { TitleBar } from '@/components/shell/TitleBar';
import { TrashList } from '@/components/whiteboard/TrashList';

export const dynamic = 'force-dynamic';

/**
 * Deleted, not gone.
 *
 * The trade I most want to delete at 4pm on a bad day is usually the one worth
 * reading on Sunday, so delete moves it here instead of destroying it. Purging
 * is a separate, deliberate act that lives only on this page.
 */
export default function TrashPage() {
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[52rem] px-6 pb-20 pt-4">
          <InTitleBar
            merged={<MergedHeader title={<>Trash</>} sub={<>Nothing here counts towards any statistic. Restore puts a trade back on the board
              exactly as it was; purging is permanent and deletes the screenshot with it.</>} data="trash">
            </MergedHeader>}
            inline={<>
          <header className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight">Trash</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
              Nothing here counts towards any statistic. Restore puts a trade back on the board
              exactly as it was; purging is permanent and deletes the screenshot with it.
            </p>
          </header>
            </>} />
          <TrashList trades={listTrades({ bin: 'trash' })} />
        </div>
      </div>
    </div>
  );
}
