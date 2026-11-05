'use client';

import { useEffect, useRef, useState } from 'react';
import { CloseX } from './CloseX';
import { AnimatePresence, motion } from 'framer-motion';
import { springSoft, exitQuick } from '@/lib/motion';
import { localDay } from '@/lib/day';
import type { FocusStatus } from '@/lib/review';

export interface FocusData { focus: FocusStatus | null; options: Array<{ id: string; short: string; text: string }> }

/**
 * One rule for the week. Shows the streak of trades that kept it and the
 * week so far; click to choose another. Defaults to the rule behind the #1 leak.
 */
export function FocusPill({ data, onChanged, onHide }: { data: FocusData | null; onChanged: () => void; onHide?: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  /*
    Which way the menu opens, measured when it opens: up where there is room
    above (the board's bottom-left, where it began), down where there is not
    (the Dashboard header — opening up there ran into the title bar), and no
    taller than the room on that side.
  */
  const [place, setPlace] = useState<{ up: boolean; max: number }>({ up: true, max: 420 });
  const toggle = () => {
    if (!open && box.current) {
      const r = box.current.getBoundingClientRect();
      const above = r.top - 56;            // the title bar
      const below = window.innerHeight - r.bottom - 16;
      const up = above >= Math.min(320, below) && above > below * 0.8;
      setPlace({ up, max: Math.max(160, Math.min(window.innerHeight * 0.6, (up ? above : below) - 8)) });
    }
    setOpen((o) => !o);
  };
  // The menu closes on its ✕, on Escape, and on any click outside it.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', down);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); };
  }, [open]);
  if (!data?.focus) return null;
  const f = data.focus;
  async function choose(ruleId: string) {
    setOpen(false);
    await fetch('/api/review/focus', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ today: localDay(), ruleId }) });
    onChanged();
  }
  return (
    <div ref={box} className="relative flex items-center gap-1" data-focus-pill={f.ruleId}>
      <button type="button" onClick={toggle} title={`${f.text}${f.chosen ? '' : ' — the rule behind your #1 leak. Click to choose another.'}`}
        className="glass flex min-w-0 max-w-[18.5rem] items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px]"
        style={{ background: 'color-mix(in srgb, var(--bg-raised) 95%, transparent)', borderColor: 'rgb(var(--accent) / 0.4)' }}>
        <span className="shrink-0 font-semibold" style={{ color: 'rgb(var(--accent))' }}>This week:</span>
        <span className="min-w-0 truncate">{f.short}</span>
        <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>
          · {f.streak} in a row{f.week.kept + f.week.broken > 0 ? ` · ${f.week.kept}/${f.week.kept + f.week.broken} this week` : ''}
        </span>
      </button>
      {onHide && <CloseX onClick={onHide} label="Hide for today" className="border bg-[var(--bg-raised)]" />}
      <AnimatePresence>
        {open && (
          <motion.ul initial={{ opacity: 0, y: place.up ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }} transition={springSoft}
            data-focus-menu={place.up ? 'up' : 'down'}
            className={`glass absolute left-0 z-50 w-[19rem] overflow-y-auto rounded-[calc(16px*var(--rk))] p-1.5 ${place.up ? 'bottom-full mb-2' : 'top-full mt-2'}`}
            style={{ background: 'color-mix(in srgb, var(--bg-raised) 98%, transparent)', maxHeight: place.max, transformOrigin: place.up ? 'bottom left' : 'top left' }}>
            <li className="flex items-center justify-between px-2.5 pb-1 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Focus this week on</span>
              <CloseX onClick={() => setOpen(false)} label="Close" />
            </li>
            {data.options.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => void choose(o.id)} data-focus-option={o.id}
                  className="w-full rounded-[calc(10px*var(--rk))] px-2.5 py-1.5 text-left text-[12px] hover:bg-[var(--glass-fill-strong)]"
                  style={{ color: o.id === f.ruleId ? 'rgb(var(--accent))' : 'var(--text)' }}>
                  <b className="font-medium">{o.short}</b>
                  <span className="block text-[11px]" style={{ color: 'var(--text-faint)' }}>{o.text}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
