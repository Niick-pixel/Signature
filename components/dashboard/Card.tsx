'use client';

import { motion } from 'framer-motion';
import { springSoft } from '@/lib/motion';

/** One Dashboard card: a small caps title, an optional note on the right, the content. */
export function Card({ title, note, children, grow, onTitle }: { title: string; note?: string; children: React.ReactNode; grow?: boolean; onTitle?: () => void }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
      className={`glass flex min-h-0 flex-col rounded-[calc(20px*var(--rk))] px-4 py-3.5 ${grow ? 'h-full' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        {onTitle
          ? <button type="button" onClick={onTitle} className="shrink-0 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.08em] hover:underline" style={{ color: 'var(--text-faint)' }}>{title} →</button>
          : <h2 className="shrink-0 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</h2>}
        {note && <span className="min-w-0 truncate text-[10px]" style={{ color: 'var(--text-faint)' }}>{note}</span>}
      </div>
      <div className={`mt-2 ${grow ? 'min-h-0 flex-1' : ''}`}>{children}</div>
    </motion.section>
  );
}
