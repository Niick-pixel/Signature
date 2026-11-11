import { notFound } from 'next/navigation';
import { getTrade, listTrades } from '@/db/trades';
import { NewTradeForm } from '@/components/capture/NewTradeForm';
import { lessonsBySetup } from '@/lib/lessons';
import { TitleBar } from '@/components/shell/TitleBar';
import { isBacktest } from '@/lib/domain';

export const dynamic = 'force-dynamic';

/** `?edit=<id>` reopens the same form pre-filled instead of starting a new one. */
export default async function NewTradePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const trade = edit ? getTrade(edit) : null;
  if (edit && !trade) notFound();

  const trades = listTrades();

  return (
    <div className="relative h-dvh overflow-hidden">

      <div className="relative flex h-dvh flex-col">
        <TitleBar />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/*
            Wide, and dynamic with the window.

            The form grew past what a single 42rem column could hold without
            becoming a scroll marathon. It now uses whatever width the window
            gives it, up to a readable ceiling, and the card inside lays its
            sections out in one, two, three or four columns to match.

            The ceiling lifts on a genuinely wide screen. 96rem was chosen when
            the card held three columns; on a 1440p monitor it left a third of
            the screen empty and still cost a scroll. Past 1900px (this app's retuned 2xl) the card is
            allowed out to 132rem, which is four columns at the same reading
            width the three had — wider columns would be the wrong trade, since
            what is scarce here is height, not characters per line.

            The bottom padding comes in at the same tier. Eighty pixels of run-
            off below the Save button is right when there is a scroll to end;
            when the card already fits the window it is eighty pixels standing
            between fitting and not.
          */}
          <div className="mx-auto w-full max-w-[var(--page-wide)] px-6 pb-20 pt-4
            2xl:pb-10">
            {/* Two sets, one per world: a backtest is shown what earlier
                backtests taught, a real trade what real trades did. */}
            <NewTradeForm trade={trade ?? undefined}
              pastLessons={lessonsBySetup(trades.filter((t) => !isBacktest(t.account)), trade ?? undefined)}
              backtestLessons={lessonsBySetup(trades.filter((t) => isBacktest(t.account)), trade ?? undefined)} />
          </div>
        </div>
      </div>
    </div>
  );
}
