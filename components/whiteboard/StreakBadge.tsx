'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { streaks } from '@/lib/stats';
import type { Trade } from '@/lib/types';

/**
 * Days journalled in a row.
 *
 * Deliberately the journaling streak and not the winning one. A winning streak
 * is mostly the market's doing and watching it is how you start trading to
 * protect a number; showing up and writing the trade down is entirely mine.
 */
export function StreakBadge({ trades }: { trades: Trade[] }) {
  const run = useMemo(() => streaks(trades), [trades]);
  if (run.journalingCurrent === 0 && run.journalingBest === 0) return null;

  const live = run.journalingCurrent > 0;

  return (
    <motion.div
      // Arrives with the board's own fade, not a second spring on top of it.
      initial={false}
      title={
        live
          ? `${run.journalingCurrent} days in a row with an entry · best ${run.journalingBest} · ${run.adherenceCurrent} clean days running`
          : `Best run: ${run.journalingBest} days. Today has no entry yet.`
      }
      className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px]"
      style={{
        borderColor: live ? 'rgb(var(--accent) / 0.45)' : undefined,
        color: live ? 'rgb(var(--accent))' : 'var(--text-faint)',
      }}
    >
      <span aria-hidden>{live ? '◆' : '◇'}</span>
      <span className="tabular-nums font-medium">
        {live ? `${run.journalingCurrent} day${run.journalingCurrent === 1 ? '' : 's'}` : 'streak broken'}
      </span>
      {run.adherenceCurrent > 0 && (
        <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>
          · {run.adherenceCurrent} clean
        </span>
      )}
    </motion.div>
  );
}
