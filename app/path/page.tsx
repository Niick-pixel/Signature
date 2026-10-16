import { TitleBar } from '@/components/shell/TitleBar';
import { PathView, type EventTrade } from '@/components/path/PathView';
import { listEvents, listPurchases, syncPath } from '@/db/path';
import { listTrades } from '@/db/trades';
import { redDayStatus } from '@/db/redDays';

export const dynamic = 'force-dynamic';

/** The Path: the steps toward a funded account, and the promises that hold until each is done. */
export default async function PathRoute({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const steps = syncPath();
  const events = listEvents();
  const ids = new Set(events.map((e) => e.trade_id).filter(Boolean));
  const eventTrades: Record<string, EventTrade> = {};
  for (const t of listTrades()) {
    if (ids.has(t.id)) eventTrades[t.id] = { date: t.date, account: t.account, outcome: t.outcome, setup_type: t.setup_type };
  }
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[64rem] px-6 pb-20 pt-4">
          <PathView steps={steps} events={events} purchases={listPurchases()} eventTrades={eventTrades} startEditing={edit === '1'}
            redDays={(() => { const r = redDayStatus(); return { withPage: r.withPage, without: r.without }; })()} />
        </div>
      </div>
    </div>
  );
}
