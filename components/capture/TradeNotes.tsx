'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { springSoft } from '@/lib/motion';
import type { TradeNote } from '@/lib/tradeNotes';

const TONE = { win: 'var(--outcome-win)', loss: 'var(--outcome-loss)', watch: 'var(--amber)' } as const;
/** One note at a time, the next after this long; a dot jumps. */
const EVERY_MS = 9000;

/**
 * Notes from your own journal (lib/tradeNotes), one at a time, turning over
 * by themselves: the last lessons, the mistake you tag most, what you do
 * best, what this grade did before. `compact`: Step 1's one-line strip under
 * Confidence; otherwise a card that takes the room its column has left.
 */
export function TradeNotes({ world, exclude, grade, compact = false, title, still = false }: {
  world: 'backtest' | 'real'; exclude?: string | null; grade?: string | null; compact?: boolean; title?: string;
  /** Inside the Rotator, which turns it over itself: no dots of its own and no turning — the list shows the rest. */
  still?: boolean;
}) {
  const [notes, setNotes] = useState<TradeNote[] | null>(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ world, ...(exclude ? { exclude } : {}), ...(grade ? { grade } : {}) });
    void fetch(`/api/trade-notes?${q}`).then((r) => (r.ok ? r.json() : [])).then((n: TradeNote[]) => { if (live) { setNotes(n); setI(0); } }).catch(() => { if (live) setNotes([]); });
    return () => { live = false; };
  }, [world, exclude, grade]);
  const count = notes?.length ?? 0;
  useEffect(() => {
    if (count < 2 || paused || still) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % count), EVERY_MS);
    return () => window.clearInterval(t);
  }, [count, paused, still]);

  const note = notes?.[i % Math.max(1, count)] ?? null;
  const empty = notes !== null && !count;
  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} data-trade-notes={compact ? 'compact' : 'card'}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-[calc(14px*var(--rk))] border ${compact ? 'px-3 py-2' : 'min-h-[6.5rem] flex-1 p-3'}`}
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: note?.tone ? `rgb(${TONE[note.tone]})` : 'var(--text-faint)' }}>
          {empty ? (title ?? 'From your journal') : note?.title ?? (title ?? 'From your journal')}
        </span>
        {count > 1 && !still && (
          <span className="flex shrink-0 gap-1" role="tablist" aria-label="Notes">
            {notes!.map((n, k) => (
              <button key={n.id} type="button" role="tab" aria-selected={k === i} aria-label={n.title} onClick={() => setI(k)}
                className="h-1.5 rounded-full transition-all" style={{ width: k === i ? 12 : 6, background: k === i ? 'rgb(var(--accent))' : 'var(--glass-stroke)' }} />
            ))}
          </span>
        )}
      </div>
      <div className={`relative ${compact ? 'mt-0.5 min-h-[2.4em]' : 'mt-1.5'}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={note?.id ?? 'empty'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
            transition={springSoft} className={`${compact ? 'line-clamp-2 text-[11.5px]' : 'text-[14px] font-medium'} leading-snug`} style={{ color: 'var(--text-dim)' }} data-trade-note={note?.id}>
            {notes === null ? '…' : empty ? 'Your lessons, your most tagged mistake and what each grade did will show here as you log trades.' : note?.body}
          </motion.p>
        </AnimatePresence>
      </div>
      {/* The card: the rest under the one in front, a tap brings one forward. */}
      {!compact && count > 1 && (
        <ul className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: 'var(--glass-stroke)' }} data-trade-notes-rest>
          {notes!.map((n, k) => k === i ? null : (
            <li key={n.id}>
              <button type="button" onClick={() => setI(k)} className="block w-full text-left text-[11.5px] leading-snug">
                <span className="font-semibold" style={{ color: n.tone ? `rgb(${TONE[n.tone]})` : 'var(--text-faint)' }}>{n.title}: </span>
                <span className="line-clamp-2" style={{ color: 'var(--text-faint)', display: 'inline' }}>{n.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Step 2's one card for what is read, not written: the decision replay, the Rubric v2 progress, similar
 * setups and your notes, one at a time, turning over by themselves (paused under the pointer); a dot jumps.
 * Every slide fills the same box, so the form never changes height as they turn.
 */
export function Rotator({ slides }: { slides: Array<{ id: string; label: string; node: React.ReactNode }> }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  useEffect(() => {
    if (n < 2 || paused) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % n), EVERY_MS);
    return () => window.clearInterval(t);
  }, [n, paused]);
  const s = slides[i % Math.max(1, n)];
  if (!s) return null;
  return (
    <div className="relative flex min-h-[9.5rem] flex-1 flex-col" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} data-rotator={s.id}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={s.id} className="flex min-h-0 flex-1 flex-col overflow-hidden [&>*]:min-h-0 [&>*]:flex-1"
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }} transition={springSoft}>
          {s.node}
        </motion.div>
      </AnimatePresence>
      {n > 1 && (
        <span className="absolute bottom-2 right-3 flex gap-1" role="tablist" aria-label="Turn over">
          {slides.map((x, k) => (
            <button key={x.id} type="button" role="tab" aria-selected={k === i} aria-label={x.label} title={x.label} onClick={() => setI(k)} data-rotator-dot={x.id}
              className="h-1.5 rounded-full transition-all" style={{ width: k === i ? 12 : 6, background: k === i ? 'rgb(var(--accent))' : 'var(--glass-stroke)' }} />
          ))}
        </span>
      )}
    </div>
  );
}
