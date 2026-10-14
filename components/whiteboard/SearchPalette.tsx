'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, springSoft, scrimExit, exitQuick } from '@/lib/motion';
import { search, type Hit } from '@/lib/search';
import { reasonAccent } from '@/lib/layout';
import type { JournalPage, Trade } from '@/lib/types';
import { tradeDay } from '@/lib/when';

/**
 * Find a trade by what I wrote about it.
 *
 * "That one where I said I was chasing it" is a real query, and no combination
 * of filters answers it — the explanation is the only place the thought exists.
 */
export function SearchPalette({ trades, pages = [], open, onClose, onOpenTrade }: {
  trades: Trade[];
  /** Journal pages, searched alongside the trades. */
  pages?: JournalPage[];
  open: boolean;
  onClose: () => void;
  onOpenTrade: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => search(trades, q, 40, pages), [trades, q, pages]);

  useEffect(() => {
    if (open) { setQ(''); setCursor(0); window.setTimeout(() => inputRef.current?.focus(), 40); }
  }, [open]);

  useEffect(() => { setCursor(0); }, [q]);

  /*
    A trade opens its detail panel; a page opens the journal.

    The palette deliberately does not know which of those it is doing until
    the moment it happens — mixing the two in one list is the point, because
    "that thing I wrote about overtrading" is a memory of a sentence, not of
    which screen it was on.
  */
  const pick = (hit: Hit) => {
    if (hit.kind === 'trade') onOpenTrade(hit.trade.id);
    else window.location.href = '/journal';
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      if (e.key === 'Enter' && hits[cursor]) {
        e.preventDefault();
        pick(hits[cursor]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hits, cursor, onClose, onOpenTrade]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: 'none', transition: scrimExit }}
            transition={spring}
            onClick={onClose}
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0,0,0,0.6)' /* no backdrop blur: see Overlay */ }}
          />
          <div className="pointer-events-none fixed inset-x-0 top-[12vh] z-[71] flex justify-center px-6">
            <motion.div
              initial={{ opacity: 0, y: -14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.99, transition: exitQuick }}
              transition={springSoft}
              className="glass pointer-events-auto w-full max-w-[40rem] overflow-hidden rounded-[calc(22px*var(--rk))]"
              style={{ background: 'color-mix(in srgb, var(--bg-raised) 92%, transparent)' }}
            >
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search everything you wrote…"
                className="w-full bg-transparent px-5 py-4 text-[15px] outline-none"
                style={{ color: 'var(--text)', borderBottom: '1px solid var(--glass-stroke)' }}
              />

              <div data-stagger className="max-h-[52vh] overflow-y-auto">
                {q.trim().length < 2 ? (
                  <p className="px-5 py-4 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                    Type at least two characters. Searches the explanation, the lesson, the reason,
                    the setup and the mistake tags.
                  </p>
                ) : hits.length === 0 ? (
                  <p className="px-5 py-4 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                    Nothing matches “{q}”.
                  </p>
                ) : (
                  hits.map((hit, i) => (
                    <Row
                      key={hit.kind === 'trade' ? hit.trade.id : `page-${hit.page.id}`}
                      hit={hit}
                      active={i === cursor}
                      onPick={() => pick(hit)}
                    />
                  ))
                )}
              </div>

              <div
                className="flex items-center gap-3 px-5 py-2.5 text-[10px]"
                style={{ borderTop: '1px solid var(--glass-stroke)', color: 'var(--text-faint)' }}
              >
                <span>↑↓ to move</span><span>↵ to open</span><span>Esc to close</span>
                {hits.length > 0 && <span className="ml-auto tabular-nums">{hits.length} found</span>}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function Row({ hit, active, onPick }: { hit: Hit; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseDown={(e) => e.preventDefault()}
      className="block w-full px-5 py-3 text-left"
      style={{ background: active ? 'var(--glass-fill-strong)' : 'transparent' }}
    >
      <div className="flex items-center gap-2">
        {hit.kind === 'trade' ? (
          <>
            <span className="size-1.5 shrink-0 rounded-full"
              style={{ background: `rgb(${reasonAccent(hit.trade.reason)})` }} />
            <span className="truncate text-[12px] font-medium">{hit.trade.reason}</span>
            <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-faint)' }}>
              {tradeDay(hit.trade)} · {hit.trade.checklist_score}/100
              {' · in '}{hit.field}
            </span>
          </>
        ) : (
          <>
            <span className="shrink-0 text-[10px]" style={{ color: 'rgb(var(--accent))' }}>✎</span>
            <span className="truncate text-[12px] font-medium">
              {hit.page.title || 'Untitled page'}
            </span>
            <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-faint)' }}>
              {hit.page.day}{' · journal'}
            </span>
          </>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>
        {hit.excerpt}
      </p>
    </button>
  );
}
