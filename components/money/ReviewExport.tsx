'use client';
import { BarInner, barAttrs } from '@/components/ui/BarButton';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { press, spring, springSoft, exitQuick } from '@/lib/motion';

/**
 * "Review this month with Claude": the month on screen, as one document that
 * explains itself, with or without its charts.
 *
 * Two files rather than one because they are used differently: the Markdown
 * alone is enough for the numbers and the writing, and small enough to paste;
 * the zip adds every chart, named after its trade, for when the review should
 * look at the entries too.
 */
export function ReviewExport({ month, label, options, title, blurb }: {
  month?: string; label: string;
  /** Replaces the monthly menu — the journal export passes its ranges. An
      option with `onPick` runs it instead of following `href` (the Trades
      list sends the ids it shows). */
  options?: Array<{ href: string; title: string; note: string; onPick?: () => void }>;
  title?: string;
  blurb?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', key); };
  }, [open]);

  return (
    <div ref={box} className="relative ml-auto">
      <motion.button
        type="button"
        data-review-export
        onClick={() => setOpen((o) => !o)}
        whileTap={press}
        whileHover={{ y: -1 }}
        transition={spring}
        aria-expanded={open}
        {...barAttrs('menu', open)}
      >
        <BarInner kind="menu">{title ?? `Review ${label} with Claude`}</BarInner>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: exitQuick }}
            transition={springSoft}
            style={{ transformOrigin: 'top right' }}
            // Positioned here, glass inside: .glass sets position: relative
            // outside any layer, which beats the absolute utility and dropped
            // the menu into the row, stretching it.
            className="absolute right-0 top-full z-30 mt-2 w-[22rem]"
          >
            <div className="glass rounded-[calc(18px*var(--rk))] p-3"
              style={{ background: 'color-mix(in srgb, var(--bg-raised) 99%, transparent)' }}>
              <p className="px-2 pb-2 pt-1 text-[11.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>
                {blurb ?? 'The whole month as one document: numbers, rules, mornings, misses and every trade with what you wrote — plus what to ask. Attach it to a new Claude chat; it explains itself.'}
              </p>
              {(options ?? [
                { href: `/api/review-export?month=${month}&format=md`, title: 'Document only', note: '.md — the numbers and your writing' },
                { href: `/api/review-export?month=${month}&format=zip`, title: 'With charts', note: '.zip — the document plus every chart, named after its trade' },
              ]).map((o) => <Option key={o.href} {...o} onPick={o.onPick && (() => { setOpen(false); o.onPick!(); })} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Option({ href, title, note, onPick }: { href: string; title: string; note: string; onPick?: () => void }) {
  return (
    <a href={href} download onClick={onPick ? (e) => { e.preventDefault(); onPick(); } : undefined}
      className="block rounded-[calc(12px*var(--rk))] px-2.5 py-2 outline-none transition-colors duration-150
        hover:bg-[var(--glass-fill-strong)] focus-visible:bg-[var(--glass-fill-strong)]">
      <span className="block text-[12.5px] font-medium">{title}</span>
      <span className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>{note}</span>
    </a>
  );
}
