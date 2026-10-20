'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { springSoft, exitQuick } from '@/lib/motion';
import { useBrokenRules } from './TradeRules';

/** Fired by the trade form once a save went through: `detail` is the trade id. */
export const TRADE_SAVED = 'signature:trade-saved';

/**
 * Right after a save: the rules that trade broke, for a few seconds at the
 * top of the screen. Never a dialog, never in the way — it is already saved.
 */
export function SavedNotice() {
  const [id, setId] = useState<string | null>(null);
  const rules = useBrokenRules(id);
  useEffect(() => {
    const on = (e: Event) => setId((e as CustomEvent<string>).detail);
    window.addEventListener(TRADE_SAVED, on);
    return () => window.removeEventListener(TRADE_SAVED, on);
  }, []);
  useEffect(() => {
    if (!id || rules == null) return;
    const t = window.setTimeout(() => setId(null), rules.length ? 9000 : 3500);
    return () => window.clearTimeout(t);
  }, [id, rules]);

  const show = id != null && rules != null;
  return (
    <AnimatePresence>
      {show && (
        <motion.div data-saved-notice={rules!.length}
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: exitQuick }} transition={springSoft}
          className="glass fixed left-1/2 top-14 z-[60] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[calc(18px*var(--rk))] px-4 py-3 text-[12.5px]"
          style={{ background: 'color-mix(in srgb, var(--bg-raised) 96%, transparent)',
            borderColor: rules!.length ? 'rgb(var(--outcome-loss) / 0.35)' : 'rgb(var(--outcome-win) / 0.35)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <b>Saved.</b>{' '}
              {rules!.length === 0 ? 'Every rule the record can check was kept.'
                : rules!.length === 1 ? 'It broke one of your rules:' : `It broke ${rules!.length} of your rules:`}
              {rules!.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                  {rules!.map((r) => <li key={r.id}><span style={{ color: 'rgb(var(--outcome-loss))' }}>✕</span> {r.text}</li>)}
                </ul>
              )}
            </div>
            <button type="button" onClick={() => setId(null)} aria-label="Dismiss" className="shrink-0 text-[11px]" style={{ color: 'var(--text-faint)' }}>✕</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
