'use client';

import { useState } from 'react';
import { Overlay } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { MIN_REASON } from '@/lib/overrides';

export interface SheetItem {
  /** "No paid eval until the demo evaluation is passed." */
  text: string;
  /** Where the promise lives: "Step 3 · Demo eval". */
  where: string;
}

/**
 * A promise about to be broken, said back to me before it is.
 *
 * Calm, and impossible to miss: it names the promise, the step it belongs
 * to and the step I am actually on, and goes ahead only with a reason in my
 * own words — at least MIN_REASON characters, saved with whatever is being
 * logged and shown on the Path. "Go back" undoes the choice. Nothing is ever
 * refused; nothing is ever let through without being said.
 */
export function CommitmentSheet({
  open, title = 'This breaks a commitment', items, current, confirmLabel = 'Log it anyway', onCancel, onConfirm,
}: {
  open: boolean;
  title?: string;
  items: SheetItem[];
  /** "Step 1 of 6 · Backtest sample" — where I am. */
  current: string | null;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const left = Math.max(0, MIN_REASON - reason.trim().length);
  const close = () => { setReason(''); onCancel(); };

  return (
    <Overlay open={open} onClose={close} className="w-[min(34rem,calc(100vw-2rem))] rounded-[calc(26px*var(--rk))] p-6"
      scrim={{ opacity: 0.55 }} surface="color-mix(in srgb, var(--bg-raised) 97%, transparent)">
      <div data-commitment-sheet className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-8 place-items-center rounded-full text-[15px]"
            style={{ background: 'rgb(var(--accent) / 0.14)', color: 'rgb(var(--accent))', boxShadow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 0 22px -6px rgb(var(--accent) / 0.6)' }}>◆</span>
          <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
        </div>

        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.text} className="rounded-[calc(14px*var(--rk))] border px-4 py-3"
              style={{ borderColor: 'rgb(var(--accent) / 0.4)', background: 'rgb(var(--accent) / 0.07)' }}>
              <div className="text-[13.5px] font-medium leading-snug">“{it.text}”</div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>{it.where}</div>
            </li>
          ))}
        </ul>

        {current && (
          <p className="text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
            You are on <b style={{ color: 'var(--text)' }}>{current}</b>.
          </p>
        )}

        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-faint)' }}>
            Why, in your own words
          </span>
          <textarea
            data-commitment-reason
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="glass mt-1.5 w-full resize-none rounded-[calc(14px*var(--rk))] px-4 py-3 text-[13px] outline-none"
            placeholder="What changed, and why it is worth breaking the promise now…"
          />
          <span className="mt-1 block text-[11px] tabular-nums" style={{ color: left ? 'var(--text-faint)' : 'rgb(var(--accent))' }}>
            {left ? `${left} more characters` : 'Saved with it, and shown on the Path.'}
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={close} data-commitment-cancel>Go back</Button>
          <Button variant="primary" disabled={left > 0} data-commitment-confirm
            onClick={() => { const r = reason.trim(); setReason(''); onConfirm(r); }}
            style={left > 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
