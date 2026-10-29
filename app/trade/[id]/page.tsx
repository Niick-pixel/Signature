import { notFound } from 'next/navigation';
import { TitleBar } from '@/components/shell/TitleBar';
import { TradeView } from '@/components/trade/TradeView';
import { getTrade, listTrades } from '@/db/trades';
import { getBars, listExecutions } from '@/db/executions';
import { getPrep } from '@/db/prep';
import { notesForTrade } from '@/db/study';
import { shotsFor } from '@/db/shots';
import { drawingsFor } from '@/db/drawings';
import { reviewInputs } from '@/db/review';
import { dayBreaksByTrade, fieldEras, planBreaks } from '@/lib/review';
import { planDay, planMatch } from '@/lib/planMatch';
import { excursion, tradeMetrics } from '@/lib/executions';
import { analysable } from '@/lib/analytics';
import { TILT_LABEL, tilt } from '@/lib/behaviour';
import { isBacktest } from '@/lib/domain';

export const dynamic = 'force-dynamic';

/**
 * One trade, on its own page: what it made against what was planned, how
 * long it was held, what it cost, the plan and the confluences behind it,
 * the fills, the chart and the screenshots. Read-only — editing stays in the
 * New trade form, so there is one way to change a trade.
 */
export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trade = getTrade(id);
  if (!trade) notFound();

  const exec = listExecutions({ tradeId: id })[0] ?? null;
  const bars = getBars(id);
  const prep = trade.undated ? null : getPrep(planDay(trade));
  const plan = planMatch(trade, prep?.data ?? null);

  const { trades, ctxFor, cfg } = reviewInputs();
  const breaks = dayBreaksByTrade(trades, ctxFor, cfg);
  // The plan's rules: the computer's checks (auto) and the ones you said you broke (self).
  const broken = planBreaks(trade, breaks, cfg, fieldEras(trades)).map((b) => ({ short: b.short, text: b.text, source: b.source ?? 'auto' }));

  // Neighbours in time, for ← and →: every live trade, in the order traded.
  const order = listTrades().filter((t) => !t.deleted_at).sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const at = order.findIndex((t) => t.id === id);
  const prev = at > 0 ? order[at - 1].id : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1].id : null;

  // Tilt is read within one world: a replay's losses say nothing about a live re-entry.
  const sameWorld = analysable(trades).filter((t) => isBacktest(t.account) === isBacktest(trade.account));
  const tiltEvent = tilt(sameWorld).events.find((e) => e.tradeId === id);
  const tiltNotes = tiltEvent ? tiltEvent.kinds.map((k) => (k === 'fast' && tiltEvent.gap != null ? `${TILT_LABEL[k]} (${tiltEvent.gap} min)` : TILT_LABEL[k])) : [];

  const metrics = tradeMetrics(trade, exec ? { entryAt: exec.entry_at, exitAt: exec.exit_at } : null);
  const entryAt = exec?.entry_at ?? null;
  const ex = bars && exec && trade.entry_price != null
    ? excursion(bars.bars, trade.direction === 'Short' ? 'Short' : 'Long', exec.entry_price, exec.entry_at, exec.exit_at) : null;

  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="signature-enter min-h-0 flex-1 overflow-y-auto">
        <TradeView trade={trade} exec={exec} bars={bars} plan={plan} broken={broken} prev={prev} next={next}
          metrics={metrics} excursion={ex} entryAt={entryAt} studyNotes={notesForTrade(id)} tilt={tiltNotes}
          drawnR={Object.values(drawingsFor(shotsFor(id).map((x) => x.path))).find((d) => d.r != null)?.r ?? null} />
      </div>
    </div>
  );
}
