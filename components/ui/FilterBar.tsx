'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Reveal } from '@/components/ui/Motion';
import { press, spring, springSnappy } from '@/lib/motion';

/*
  One way to filter, on every page that filters (Dashboard, Stats): a "Filters" chip in the header that
  opens a panel of rows — a label beside its taps, never a dropdown — with Clear at the foot; and, while
  the panel is closed, what is filtered as tokens under the header, each removable on its own.
*/

/** The chip in the header: "Filters · 2 ▾". */
export function FilterChip({ open, count, onClick, title = 'Filter what this page shows' }: { open: boolean; count: number; onClick: () => void; title?: string }) {
  const on = open || count > 0;
  return (
    <motion.button type="button" onClick={onClick} title={title} whileTap={press} transition={spring} data-filter-chip={count} aria-expanded={open}
      className="rounded-full border px-3.5 py-1.5 text-[12px] font-medium"
      style={{ borderColor: on ? 'rgb(var(--accent) / 0.55)' : 'var(--glass-stroke)', background: on ? 'rgb(var(--accent) / 0.12)' : 'var(--glass-fill)', color: on ? 'rgb(var(--accent))' : 'var(--text-dim)' }}>
      Filters{count ? ` · ${count}` : ''} <span aria-hidden className="inline-block transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
    </motion.button>
  );
}

/** The panel: rows of taps, and Clear when anything is filtered. */
export function FilterPanel({ open, onClear, count, children, className = '' }: { open: boolean; onClear?: () => void; count: number; children: React.ReactNode; className?: string }) {
  return (
    <Reveal open={open}>
      <div className={`glass mb-3 grid gap-x-6 gap-y-2.5 rounded-[calc(18px*var(--rk))] px-4 py-3 sm:grid-cols-[auto_1fr] ${className}`} data-filter-panel>
        {children}
        {onClear && (
          <div className="flex items-center justify-between gap-3 border-t pt-2 sm:col-span-2" style={{ borderColor: 'var(--glass-stroke)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{count ? `${count} filter${count === 1 ? '' : 's'} on` : 'Showing everything'}</span>
            {count > 0 && <button type="button" onClick={onClear} className="text-[11.5px] font-medium underline-offset-2 hover:underline" style={{ color: 'rgb(var(--accent))' }} data-filter-clear>Clear filters</button>}
          </div>
        )}
      </div>
    </Reveal>
  );
}

/** One question: its label beside its taps. */
export function FilterRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <>
      <span className="pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }} title={hint}>{label}</span>
      <div className="flex flex-wrap items-center gap-1.5" data-filter-row={label}>{children}</div>
    </>
  );
}

/** One tap: a tinted pill when on, as everywhere else in the app. */
export function FilterPill({ on, onClick, title, disabled, children }: { on: boolean; onClick: () => void; title?: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <motion.button type="button" onClick={onClick} title={title} disabled={disabled} aria-pressed={on} whileTap={press} transition={springSnappy}
      className="rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors hover:border-[rgb(var(--accent)/0.4)] disabled:pointer-events-none disabled:opacity-40"
      style={{
        borderColor: on ? 'rgb(var(--accent) / 0.45)' : 'var(--glass-stroke)',
        background: on ? 'rgb(var(--accent) / 0.14)' : 'transparent',
        color: on ? 'rgb(var(--accent))' : 'var(--text-dim)',
        boxShadow: on ? 'inset 0 0 0 1px rgb(var(--accent) / 0.2)' : 'none',
      }}>
      {children}
    </motion.button>
  );
}

/** What is filtered, while the panel is closed: one token each, × lets it go. */
export function ActiveFilters({ items, open }: { items: Array<{ id: string; label: string; onRemove: () => void }>; open: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {!open && items.length > 0 && (
        <motion.div key="active" className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]" data-active-filters={items.length}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={spring}>
          <span style={{ color: 'var(--text-faint)' }}>Filtered:</span>
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <motion.button key={it.id} type="button" onClick={it.onRemove} title={`Remove: ${it.label}`} layout data-active-filter={it.id}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }} transition={springSnappy}
                className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium"
                style={{ borderColor: 'rgb(var(--accent) / 0.35)', background: 'rgb(var(--accent) / 0.08)', color: 'rgb(var(--accent))' }}>
                {it.label}<span aria-hidden className="opacity-70">×</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
