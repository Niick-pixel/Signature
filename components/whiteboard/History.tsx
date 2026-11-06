'use client';

import { Reveal } from '@/components/ui/Motion';
import { useEffect, useState } from 'react';
import type { TradeEdit } from '@/lib/types';

/**
 * Every change since the trade was written.
 *
 * Not to police me — so I can see whether I quietly upgrade a trade three days
 * later, once I know how it turned out. A checklist box that got ticked after
 * the close is the most interesting row in this app.
 */
export function History({ tradeId }: { tradeId: string }) {
  const [edits, setEdits] = useState<TradeEdit[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/trades/${tradeId}/history`)
      .then((r) => r.json())
      .then((rows: TradeEdit[]) => { if (live) setEdits(rows); })
      .catch(() => { if (live) setEdits([]); });
    return () => { live = false; };
  }, [open, tradeId]);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] uppercase tracking-[0.08em]"
        style={{ color: 'var(--text-faint)' }}
      >
        History {open ? '−' : '+'}
      </button>

      <Reveal open={open}>
        <div className="mt-2.5">
          {edits === null ? (
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Loading…</p>
          ) : edits.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
              Never edited since it was written.
            </p>
          ) : (
            <div data-stagger className="space-y-1.5">
              {edits.map((e) => (
                <div key={e.id} className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="shrink-0" style={{ color: 'var(--text-faint)' }}>
                    {new Date(e.changed_at).toLocaleString(undefined, {
                      dateStyle: 'short', timeStyle: 'short',
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right">
                    <span style={{ color: 'var(--text-dim)' }}>{e.field}</span>
                    {'  '}
                    <span style={{ color: 'var(--text-faint)' }}>{e.old_value ?? '—'}</span>
                    {' → '}
                    <span>{e.new_value ?? '—'}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
