'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Collapse } from '@/components/ui/Collapse';
import { flagsFor } from '@/lib/flags';
import type { Trade } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

const AMBER = 'var(--amber)';

/**
 * Contradictions in the record, shown after the fact.
 *
 * None of this ran at save time and none of it could have stopped the save.
 * A trade that contradicts itself is still the true record of what happened —
 * the flag exists so I see it on Sunday, not so the form argues with me on a
 * Thursday afternoon.
 */
export function FlagList({ trade, onChanged }: { trade: Trade; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const flags = flagsFor(trade);
  if (flags.length === 0) return null;

  /**
   * One click dismisses. The reason is asked for afterwards, beside the
   * dismissed flag, and saved into the same dismissal — a reason is worth
   * having, but never worth a second click before the flag goes quiet.
   */
  async function dismiss(flag: string, why: string | null = null) {
    setBusy(flag);
    await fetch(`/api/trades/${trade.id}/flags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag, reason: why }),
    });
    setBusy(null);
    onChanged();
  }

  async function restore(flag: string) {
    setBusy(flag);
    await fetch(`/api/trades/${trade.id}/flags?flag=${encodeURIComponent(flag)}`, { method: 'DELETE' });
    setBusy(null);
    onChanged();
  }

  return (
    <div className="mt-6">
      <div className="mb-2.5 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
        Flags
      </div>

      <div data-stagger className="space-y-2">
        {flags.map((flag) => {
          const dismissedReason = trade.dismissed_flags[flag.key];
          const isDismissed = flag.key in trade.dismissed_flags;

          return (
            <div
              key={flag.key}
              className="rounded-[calc(14px*var(--rk))] px-4 py-3"
              style={{
                background: isDismissed ? 'var(--glass-fill)' : `rgb(${AMBER} / 0.09)`,
                border: `1px solid ${isDismissed ? 'var(--glass-stroke)' : `rgb(${AMBER} / 0.30)`}`,
                opacity: isDismissed ? 0.7 : 1,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className="text-[12px] font-medium leading-snug"
                    style={{ color: isDismissed ? 'var(--text-dim)' : `rgb(${AMBER})` }}
                  >
                    {flag.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                    {flag.detail}
                  </div>
                  {isDismissed && (
                    <div className="mt-1.5 text-[11px] italic" style={{ color: 'var(--text-faint)' }}>
                      Dismissed{dismissedReason ? ` — ${dismissedReason}` : ''}
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                  {isDismissed ? (
                    <Button onClick={() => restore(flag.key)} disabled={busy === flag.key}>Undo</Button>
                  ) : (
                    <Button
                      onClick={() => { setDrafting(flag.key); setReason(''); void dismiss(flag.key); }}
                      disabled={busy === flag.key}
                      title="Dismisses it now. You can say why straight after."
                    >
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {drafting === flag.key && isDismissed && !dismissedReason && (
                  <Collapse key="reason">
                    <div className="pt-3">
                      <Input
                        autoFocus
                        placeholder="Why is this one fine? (optional — Enter to save)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && reason.trim()) { void dismiss(flag.key, reason.trim()); setDrafting(null); }
                        }}
                        onBlur={() => { if (reason.trim()) void dismiss(flag.key, reason.trim()); setDrafting(null); }}
                      />
                    </div>
                  </Collapse>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
