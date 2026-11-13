import Link from 'next/link';
import { V2Mark } from '@/components/ui/V2Mark';
import { GRADE_COLOR } from '@/lib/grade';
import { OUTCOME_COLOR } from '@/components/whiteboard/TradeNode';
import type { Trade } from '@/lib/types';
import { tradeTime } from '@/lib/when';

const usd = (v: number) =>
  `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

/**
 * The trades that actually happened on this day.
 *
 * Opening a red square on the calendar used to land on a review form with a
 * count and nothing else — the one thing you came to look at, the trades, was
 * not on the page. Worse, two empty days looked identical, so stepping between
 * them with the arrows read as broken navigation rather than as two days with
 * nothing written on them.
 */
export function DayTrades({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: 'var(--text-faint)' }}>
        Nothing traded on this day.
      </p>
    );
  }

  const priced = trades.filter((t) => t.pnl_dollars != null);
  const net = priced.reduce((sum, t) => sum + (t.pnl_dollars as number), 0);
  const totalR = trades.reduce((sum, t) => sum + (t.r_multiple ?? 0), 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12px]">
        <span className="tabular-nums text-[15px] font-semibold"
          style={{
            color: priced.length === 0 ? 'var(--text-faint)'
              : net >= 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))',
          }}>
          {priced.length === 0 ? '—' : usd(net)}
        </span>
        <span className="tabular-nums" style={{ color: 'var(--text-dim)' }}>
          {totalR > 0 ? '+' : ''}{totalR.toFixed(1)}R
        </span>
        {priced.length < trades.length && (
          <span style={{ color: 'var(--text-faint)' }}>
            {trades.length - priced.length} with no P&amp;L recorded
          </span>
        )}
      </div>

      <div data-stagger className="space-y-1.5">
        {trades.map((t) => (
          <Link
            data-lift
            key={t.id}
            href={`/new?edit=${t.id}`}
            className="flex items-center gap-3 rounded-[calc(14px*var(--rk))] border px-3.5 py-2.5 transition-transform hover:scale-[1.01]"
            style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}
          >
            <span className="flex h-7 min-w-7 shrink-0 items-center justify-center px-1 rounded-[calc(9px*var(--rk))] text-[11px] font-semibold"
              style={{
                color: `rgb(${GRADE_COLOR[t.grade_letter ?? 'F']})`,
                background: `rgb(${GRADE_COLOR[t.grade_letter ?? 'F']} / 0.14)`,
              }}>
              {t.grade_letter ?? '—'}<V2Mark t={t} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{t.reason}</span>
              <span className="block truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {tradeTime(t)}
                {' · '}{t.instrument} {t.direction}{' · '}{t.setup_type}
                {t.mistake_tags.length > 0 && ` · ${t.mistake_tags.join(', ')}`}
              </span>
            </span>

            <span className="shrink-0 text-right">
              <span className="block tabular-nums text-[13px] font-semibold"
                style={{ color: `rgb(${OUTCOME_COLOR[t.outcome]})` }}>
                {t.pnl_dollars != null ? usd(t.pnl_dollars) : '—'}
              </span>
              <span className="block tabular-nums text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {t.r_multiple != null ? `${t.r_multiple > 0 ? '+' : ''}${t.r_multiple.toFixed(1)}R` : t.outcome}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
