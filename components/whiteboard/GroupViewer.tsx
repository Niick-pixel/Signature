'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GRADE_COLOR } from '@/lib/grade';
import { adherenceOf } from '@/lib/adherence';
import { press, spring } from '@/lib/motion';
import { Overlay } from '@/components/ui/Overlay';
import { OUTCOME_COLOR } from './TradeNode';
import type { Trade } from '@/lib/types';
import { tradeDay } from '@/lib/when';

const usd = (v: number) =>
  `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;

/**
 * The trades a group's "+N" tile stands for, at a size you can actually read.
 *
 * The board shows the newest five and a count; this is where the count goes
 * when you click it — the ones NOT on the board, newest first, with the whole
 * group a click away. Bigger cards than the board's, because the point of
 * opening it is to look at the charts rather than to find the pile again.
 */
export function GroupViewer({
  label, trades: group, hiddenIds, onOpenTrade, onClose,
}: {
  label: string | null;
  trades: Trade[];
  /** The trades behind the "+N" tile; the window opens on these. */
  hiddenIds?: string[];
  onOpenTrade: (id: string) => void;
  onClose: () => void;
}) {
  const [everything, setEverything] = useState(false);
  useEffect(() => { if (label === null) setEverything(false); }, [label]);
  const hidden = useMemo(() => new Set(hiddenIds ?? []), [hiddenIds]);
  const trades = useMemo(() => {
    const list = everything || hidden.size === 0 ? group : group.filter((t) => hidden.has(t.id));
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [group, hidden, everything]);
  const partial = hidden.size > 0 && !everything;
  const net = trades.reduce((sum, t) => sum + (t.pnl_dollars ?? 0), 0);
  const priced = trades.filter((t) => t.pnl_dollars != null).length;
  const totalR = trades.reduce((sum, t) => sum + (t.r_multiple ?? 0), 0);
  const broken = trades.filter((t) => adherenceOf(t) === 'broken').length;

  return (
    <Overlay
      open={label !== null}
      onClose={onClose}
      lift={18}
      scrim={{ opacity: 0.55 }}
      className="flex max-h-[86vh] w-[min(76rem,calc(100vw-3rem))] flex-col rounded-[calc(26px*var(--rk))] p-6"
    >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[19px] font-semibold tracking-tight">{label}</h2>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-4 text-[12px]"
                  style={{ color: 'var(--text-dim)' }}>
                  <span data-viewer-count>
                    {partial
                      ? `${trades.length} not on the board · of ${group.length}`
                      : `${trades.length} trade${trades.length === 1 ? '' : 's'}`}
                  </span>
                  {hidden.size > 0 && (
                    <button type="button" data-viewer-toggle onClick={() => setEverything((v) => !v)}
                      className="underline decoration-dotted underline-offset-2" style={{ color: 'rgb(var(--accent))' }}>
                      {everything ? `Only the ${hidden.size} hidden` : `Show all ${group.length}`}
                    </button>
                  )}
                  {priced > 0 && (
                    <span className="tabular-nums"
                      style={{ color: net >= 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))' }}>
                      {usd(net)}
                    </span>
                  )}
                  <span className="tabular-nums">
                    {totalR > 0 ? '+' : ''}{totalR.toFixed(1)}R
                  </span>
                  {broken > 0 && (
                    <span style={{ color: 'rgb(var(--amber))' }}>
                      {broken} rule break{broken === 1 ? '' : 's'}
                    </span>
                  )}
                </p>
              </div>
              <motion.button
                type="button" onClick={onClose} whileTap={press} transition={spring}
                aria-label="Close" title="Close (Esc)"
                className="grid size-8 shrink-0 place-items-center rounded-full"
                style={{
                  background: 'var(--glass-fill)', border: '1px solid var(--glass-stroke)',
                  color: 'var(--text-dim)',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </motion.button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {trades.map((t) => (
                  <motion.button
                    key={t.id}
                    type="button"
                    onClick={() => onOpenTrade(t.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={press}
                    transition={spring}
                    className="overflow-hidden rounded-[calc(18px*var(--rk))] border text-left"
                    style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}
                  >
                    {/* A quick log can have no chart at all. */}
                    {t.screenshot_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/screenshots/${t.screenshot_path}?w=480`}
                        alt=""
                        className="aspect-[16/10] w-full object-cover"
                        style={{ background: 'var(--glass-fill-strong)' }}
                      />
                    ) : (
                      <div className="grid aspect-[16/10] w-full place-items-center text-[11px]"
                        style={{ background: 'var(--glass-fill-strong)', color: 'var(--text-faint)' }}>
                        No chart
                      </div>
                    )}
                    <div className="p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{t.reason}</span>
                          <span className="block truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>
                            {tradeDay(t, { day: 'numeric', month: 'short' })}
                            {' · '}{t.instrument} {t.direction}{' · '}{t.setup_type}
                          </span>
                        </span>
                        <span className="grid size-7 shrink-0 place-items-center rounded-[calc(9px*var(--rk))] text-[11px] font-semibold"
                          style={{
                            color: `rgb(${GRADE_COLOR[t.grade_letter]})`,
                            background: `rgb(${GRADE_COLOR[t.grade_letter]} / 0.14)`,
                          }}>
                          {t.grade_letter}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-baseline justify-between gap-2">
                        <span className="tabular-nums text-[13px] font-semibold"
                          style={{ color: `rgb(${OUTCOME_COLOR[t.outcome]})` }}>
                          {t.pnl_dollars != null ? usd(t.pnl_dollars)
                            : t.r_multiple != null ? `${t.r_multiple > 0 ? '+' : ''}${t.r_multiple.toFixed(1)}R`
                            : t.outcome}
                        </span>
                        {t.mistake_tags.length > 0 && (
                          <span className="truncate text-[10px]" style={{ color: 'rgb(var(--amber))' }}>
                            {t.mistake_tags.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
    </Overlay>
  );
}
