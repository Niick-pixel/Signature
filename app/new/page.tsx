import { notFound } from 'next/navigation';
import { getTrade, listTrades } from '@/db/trades';
import { boardStart } from '@/db/boardlayout';
import { NewTradeForm } from '@/components/capture/NewTradeForm';
import { lessonsBySetup } from '@/lib/lessons';
import { Whiteboard } from '@/components/whiteboard/Whiteboard';
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
  // The blurred board behind the form is decoration: the most recent cards are enough to read as the board.
  const backdrop = [...trades].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);

  return (
    <div className="relative h-dvh overflow-hidden">
      {/*
        The board stays behind the capture form, blurred and inert. Replacing it
        with a blank page made logging a trade feel like leaving the app; this
        way the thing you are adding to is still visibly there.
      */}
      {trades.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none"
          style={{ filter: 'blur(18px) saturate(0.85)', opacity: 0.5, transform: 'scale(1.04)' }}
        >
          <div className="h-dvh pt-11">
            <Whiteboard trades={backdrop} readOnly start={boardStart()} />
          </div>
        </div>
      )}

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
          <div className="mx-auto w-full max-w-[96rem] px-4 pb-20 pt-4 sm:px-6
            2xl:max-w-[132rem] 2xl:pb-10">
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
