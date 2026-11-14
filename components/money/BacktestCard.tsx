import type { Trade } from '@/lib/types';
import { isTaken } from '@/lib/domain';
import { money } from '@/lib/stats';
import { CountUp } from '@/components/ui/CountUp';
import { ReplayDatesButton } from '@/components/replay/ReplayDates';

const usd = (v: number) =>
  `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}R`;

/**
 * One line at the top of a Backtest page, so replayed numbers never read as
 * real ones — the counterpart of HypotheticalNote for the Missed account.
 */
export function BacktestNote({ undated, where }: { undated: number; where: 'stats' | 'calendar' }) {
  return (
    <p data-backtest-note className="rounded-[calc(14px*var(--rk))] px-3.5 py-2.5 text-[12px] leading-relaxed"
      style={{ background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--accent) / 0.25)', color: 'rgb(var(--accent))' }}>
      Backtest. Replayed trades, kept apart from every real figure — the All stats, the balances, the risk
      limits and the streaks. On the whiteboard they sit in a group of their own.
      {where === 'stats' && undated > 0 && ` ${undated} ${undated === 1 ? 'is' : 'are'} undated, so ${undated === 1 ? 'it sits' : 'they sit'} out of the weekday and hour heatmap and the day counts.`}
      {where === 'calendar' && ' Each backtest sits on the day it replays (its replay day’s date). Days on the wrong date? Fix replay dates, on the card below.'}
      {where === 'calendar' && undated > 0 && ` ${undated} saved with no date ${undated === 1 ? 'is' : 'are'} left off the squares but counted above.`}
    </p>
  );
}

/**
 * What the replay says so far, in R and in the replay's dollars. No balance —
 * no real money moved — so the calendar shows this where a real account
 * shows its balance.
 */
export function BacktestCard({ trades }: { trades: Trade[] }) {
  const taken = trades.filter((t) => isTaken(t.outcome));
  const withR = taken.filter((t) => t.r_multiple != null);
  const totalR = withR.reduce((s, t) => s + (t.r_multiple ?? 0), 0);
  const wins = taken.filter((t) => t.outcome === 'Win').length;
  const losses = taken.filter((t) => t.outcome === 'Loss').length;
  const decided = wins + losses;
  // The same figure Stats shows: typed P&L, or risk × R where only those were
  // given. (Summing typed P&L alone made this card and the Stats page disagree
  // about the same trades.)
  const m = money(trades);
  const dollars = m.net;
  const priced = { length: m.priced };

  return (
    <div data-backtest-card className="glass rounded-[calc(24px*var(--rk))] p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.07em]" style={{ color: 'var(--text-faint)' }}>
          Backtest — replayed trades
        </span>
        {/* Replay days planned while the date defaulted to today sit on the real calendar: put them back. */}
        <ReplayDatesButton />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="tabular-nums text-[40px] font-semibold leading-none tracking-tight"
          style={{ color: totalR > 0 ? 'rgb(var(--outcome-win))' : totalR < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text-faint)' }}>
          {withR.length ? <CountUp text={r(totalR)} /> : '—'}
        </span>
        {priced.length > 0 && (
          <span data-backtest-pnl className="tabular-nums text-[22px] font-semibold tracking-tight"
            style={{ color: dollars > 0 ? 'rgb(var(--outcome-win))' : dollars < 0 ? 'rgb(var(--outcome-loss))' : 'var(--text-faint)' }}>
            {usd(dollars)}
          </span>
        )}
        {decided > 0 && (
          <span className="tabular-nums text-[15px]" style={{ color: 'var(--text-dim)' }}>
            {Math.round((wins / decided) * 100)}% of decided trades won
          </span>
        )}
      </div>
      <p className="mt-2.5 text-[12px] leading-snug" style={{ color: 'var(--text-dim)' }}>
        {taken.length === 0
          ? 'Nothing replayed yet. Log a backtest from New trade: choose the Backtest account and it is dated today.'
          : `${taken.length} replayed · ${wins} won · ${losses} lost${priced.length < taken.length ? ` · ${taken.length - priced.length} with no dollar figure` : ''}. The full breakdown is in Stats, on the Backtest account.`}
      </p>
    </div>
  );
}
