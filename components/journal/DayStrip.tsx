'use client';

import { V2Mark } from '@/components/ui/V2Mark';
import Link from 'next/link';
import { GRADE_COLOR } from '@/lib/grade';
import { OUTCOME_COLOR } from '@/components/whiteboard/TradeNode';
import type { Outcome } from '@/lib/domain';
import type { GradeLetter } from '@/lib/grade';

/**
 * What the page's date actually contains.
 *
 * Only what the strip needs, not whole Trade rows: the journal page would
 * otherwise ship every explanation and lesson in the database to the client to
 * render a line of chips.
 */
export interface DayTradeSummary {
  id: string;
  time: string;
  reason: string;
  instrument: string;
  direction: string;
  setup_type: string;
  outcome: Outcome;
  r_multiple: number | null;
  pnl_dollars: number | null;
  grade_letter: GradeLetter;
  rubric_version?: number | null;
  mistake_tags: string[];
}

const usd = (v: number) =>
  `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

/**
 * The day's trades, on the page you are writing about that day.
 *
 * Writing "Tuesday went badly" with Tuesday's three trades sitting above the
 * cursor is a different act from writing it from memory — the point of the
 * journal being in the same app as the record is that it can look at the
 * record. Absent entirely on a day with no trades, because a strip that says
 * "0 trades" is noise on a page about an idea.
 */
export function DayStrip({ trades }: { trades: DayTradeSummary[] }) {
  if (trades.length === 0) return null;

  const priced = trades.filter((t) => t.pnl_dollars != null);
  const net = priced.reduce((sum, t) => sum + (t.pnl_dollars as number), 0);
  const totalR = trades.reduce((sum, t) => sum + (t.r_multiple ?? 0), 0);

  return (
    <div
      // Capped, so a busy day cannot squeeze the writing out of a fixed-height page.
      className="mb-6 max-h-[9.5rem] shrink-0 overflow-y-auto rounded-[calc(16px*var(--rk))] border px-4 py-3"
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.07em]"
          style={{ color: 'var(--text-faint)' }}>
          That day
        </span>
        <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
          {trades.length} trade{trades.length === 1 ? '' : 's'}
        </span>
        {priced.length > 0 && (
          <span className="tabular-nums text-[12px] font-medium"
            style={{ color: net >= 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>
            {usd(net)}
          </span>
        )}
        <span className="tabular-nums text-[12px]" style={{ color: 'var(--text-dim)' }}>
          {totalR > 0 ? '+' : ''}{totalR.toFixed(1)}R
        </span>
      </div>

      <div data-stagger className="flex flex-wrap gap-2">
        {trades.map((t) => (
          <Link
            data-lift
            key={t.id}
            href={`/new?edit=${t.id}`}
            title={`${t.reason} · ${t.instrument} ${t.direction} · ${t.setup_type}${
              t.mistake_tags.length ? ` · ${t.mistake_tags.join(', ')}` : ''
            }`}
            className="flex items-center gap-2 rounded-[calc(11px*var(--rk))] border px-2.5 py-1.5
              transition-transform hover:scale-[1.03]"
            style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill-strong)' }}
          >
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center px-0.5 rounded-[calc(6px*var(--rk))] text-[10px] font-semibold"
              style={{
                color: `rgb(${GRADE_COLOR[t.grade_letter ?? 'F']})`,
                background: `rgb(${GRADE_COLOR[t.grade_letter ?? 'F']} / 0.16)`,
              }}>
              {t.grade_letter ?? '—'}<V2Mark t={t} />
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{t.time}</span>
            <span className="tabular-nums text-[11px] font-semibold"
              style={{ color: `rgb(${OUTCOME_COLOR[t.outcome]})` }}>
              {t.pnl_dollars != null ? usd(t.pnl_dollars)
                : t.r_multiple != null ? `${t.r_multiple > 0 ? '+' : ''}${t.r_multiple.toFixed(1)}R`
                : t.outcome}
            </span>
            {t.mistake_tags.length > 0 && (
              <span className="text-[10px]" style={{ color: 'rgb(var(--amber))' }}>
                {t.mistake_tags.length}✕
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
