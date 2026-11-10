import { cookies } from 'next/headers';
import { TitleBar } from '@/components/shell/TitleBar';
import { flawDeck, type DeckSource } from '@/db/flaws';
import { FlawDeck } from '@/components/work/FlawDeck';
import { SourceToggle } from '@/components/work/SourceToggle';
import { WORK_SRC_COOKIE } from '@/lib/work-pref';

export const dynamic = 'force-dynamic';

const SOURCES: DeckSource[] = ['all', 'real', 'backtest'];

/**
 * Work on: the few things costing you most, one card at a time. The page never
 * scrolls — each card fits the window (components/work/Deck).
 */
export default async function WorkPage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const sp = await searchParams;
  const jar = await cookies();
  const asked = sp.src ?? jar.get(WORK_SRC_COOKIE)?.value;
  const source: DeckSource = SOURCES.includes(asked as DeckSource) ? (asked as DeckSource) : 'all';
  const deck = flawDeck(source);
  return (
    <div className="flex h-dvh flex-col overflow-hidden" data-work>
      <TitleBar />
      <div className="signature-enter flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-8 pt-3">
          <h1 className="text-[15px] font-semibold tracking-tight">Work on <span className="font-normal" style={{ color: 'var(--text-faint)' }}>· {deck.settledCount} settled trades</span></h1>
          <SourceToggle value={source} />
        </header>
        <FlawDeck key={source} deck={deck} />
      </div>
    </div>
  );
}
