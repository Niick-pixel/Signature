'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, exitQuick } from '@/lib/motion';
import { isTaken } from '@/lib/domain';
import type { RiskLimits, Trade } from '@/lib/types';
import { isReal } from '@/lib/domain';

const AMBER = 'var(--amber)';

/**
 * Today against the limits I set myself.
 *
 * It informs. It never locks me out of logging — a journal that refuses the
 * trade which broke the limit is a journal that guarantees the worst day of
 * the month goes unrecorded, which is the one day worth reading back.
 */
export function RiskBanner({ trades }: { trades: Trade[] }) {
  const [limits, setLimits] = useState<RiskLimits | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/limits').then((r) => r.json()).then((l: RiskLimits) => { if (live) setLimits(l); })
      .catch(() => { /* the banner is not important enough to surface an error */ });
    return () => { live = false; };
  }, []);

  if (!limits) return null;

  const today = new Date().toISOString().slice(0, 10);
  // Real trades only: a replayed loss logged today is not today's loss.
  const todays = trades.filter((t) => isReal(t.account) && t.date.slice(0, 10) === today && isTaken(t.outcome));
  if (todays.length === 0) return null;

  const count = todays.length;
  const rToday = todays.reduce((sum, t) => sum + (t.r_multiple ?? 0), 0);

  const atTradeLimit = count >= limits.max_trades_per_day;
  const atLossLimit = rToday <= -Math.abs(limits.daily_loss_limit_r);
  // Two consecutive losses, in the order they happened.
  const chrono = [...todays].sort((a, b) => a.date.localeCompare(b.date));
  const twoLosses = chrono.length >= 2
    && chrono.slice(-2).every((t) => t.outcome === 'Loss');

  const hit = atTradeLimit || atLossLimit || twoLosses;

  const reasons = [
    atTradeLimit && `trade ${count} of ${limits.max_trades_per_day}`,
    atLossLimit && `−${Math.abs(rToday).toFixed(1)}R today, limit −${Math.abs(limits.daily_loss_limit_r)}R`,
    twoLosses && 'two losses in a row',
  ].filter(Boolean);

  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8, transition: exitQuick }}
        transition={spring}
        className="glass pointer-events-auto flex items-center gap-2.5 rounded-full px-4 py-1.5 text-[11px]"
        style={{
          borderColor: hit ? `rgb(${AMBER} / 0.5)` : undefined,
          background: hit ? `rgb(${AMBER} / 0.10)` : undefined,
          color: hit ? `rgb(${AMBER})` : 'var(--text-dim)',
        }}
      >
        <span className="size-1.5 rounded-full" style={{ background: hit ? `rgb(${AMBER})` : 'var(--text-faint)' }} />
        <span className="tabular-nums">
          Today: {count} trade{count === 1 ? '' : 's'} · {rToday > 0 ? '+' : rToday < 0 ? '−' : ''}
          {Math.abs(rToday).toFixed(1)}R
        </span>
        {hit && <span>· {reasons.join(' · ')}</span>}
      </motion.div>
    </AnimatePresence>
  );
}
