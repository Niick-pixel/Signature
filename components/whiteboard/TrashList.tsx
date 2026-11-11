'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, exitQuick } from '@/lib/motion';
import { reasonAccent } from '@/lib/layout';
import type { Trade } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { DeleteTradeDialog } from './DeleteTradeDialog';
import { tradeDay } from '@/lib/when';

export function TrashList({ trades }: { trades: Trade[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [purging, setPurging] = useState<Trade | null>(null);

  async function restore(id: string) {
    setBusy(id);
    await fetch(`/api/trades/${id}/restore`, { method: 'POST' });
    setBusy(null);
    router.refresh();
  }

  /** The only place in the app that actually destroys anything — see DeleteTradeDialog. */
  function purged() {
    setPurging(null);
    router.refresh();
  }

  if (trades.length === 0) {
    return (
      <div className="glass rounded-[calc(24px*var(--rk))] p-8 text-center text-[13px]" style={{ color: 'var(--text-dim)' }}>
        Nothing in the Trash.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {trades.map((trade) => (
          <motion.div
            key={trade.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: exitQuick }}
            transition={spring}
            className="glass flex flex-wrap items-center gap-4 rounded-[calc(18px*var(--rk))] p-4"
          >
            {/* A quick log can have no chart at all. */}
            {trade.screenshot_path ? (
              <img
                src={`/api/screenshots/${trade.screenshot_path}`}
                alt=""
                className="size-14 shrink-0 rounded-[calc(10px*var(--rk))] object-cover"
                style={{ background: 'var(--letterbox)' }}
              />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-[calc(10px*var(--rk))] text-[9.5px]"
                style={{ background: 'var(--letterbox)', color: 'var(--text-faint)' }}>
                No chart
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: `rgb(${reasonAccent(trade.reason)})` }}
                />
                <span className="truncate text-[13px] font-medium">{trade.reason}</span>
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {tradeDay(trade)} · {trade.instrument} {trade.direction}
                {' · '}{trade.outcome}
                {' · deleted '}
                {trade.deleted_at ? new Date(trade.deleted_at).toLocaleDateString() : '—'}
              </div>
              {/* Why, as it was said at the time. */}
              <div data-deleted-reason className="mt-1 text-[11.5px] italic leading-snug" style={{ color: 'var(--text-dim)' }}>
                {trade.deleted_reason ?? 'No reason recorded — deleted before the app asked.'}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={() => restore(trade.id)} disabled={busy === trade.id}>Restore</Button>
              <Button variant="danger" onClick={() => setPurging(trade)}>Delete forever…</Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <DeleteTradeDialog mode="purge" trade={purging} open={purging != null} onClose={() => setPurging(null)} onDone={purged} />
    </div>
  );
}
