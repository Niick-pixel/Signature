'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { localDay } from '@/lib/day';
import { springSoft } from '@/lib/motion';
import type { StudyTotals } from '@/lib/study';
import { hm } from '@/lib/study';
import { StudyMeter } from '../StudyMeter';
import { Card, Head } from './shared';

/**
 * Today's study, tracked: the meter against your range, the week, each block
 * logged today (the timer's, the cube's, or added here), and quick buttons for
 * time studied away from the app — a book, a course, a replay session.
 */
export function StudyToday({ t, onChange }: { t: StudyTotals | null; onChange: () => void }) {
  const log = async (minutes: number) => {
    await fetch('/api/study/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: localDay(), minutes, topic: 'Logged by hand' }) });
    onChange();
  };
  const remove = async (id: string) => { await fetch(`/api/study/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); onChange(); };
  return (
    <Card data-study-today>
      <Head title="Today's study" right={t ? `${t.blocks.length} block${t.blocks.length === 1 ? '' : 's'}` : undefined} />
      {!t ? <div className="h-28" /> : (
        <>
          <StudyMeter t={t} />
          <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--glass-stroke)' }}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>Studied away from the app?</span>
              {[15, 30, 60].map((m) => (
                <button key={m} type="button" onClick={() => log(m)} data-study-log={m}
                  className="rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium"
                  style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>+ {hm(m)}</button>
              ))}
            </div>
            <ul className="mt-2 space-y-1 text-[12px]">
              <AnimatePresence initial={false}>
                {t.blocks.map((b) => (
                  <motion.li key={b.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={springSoft}
                    className="group flex items-center gap-2" data-study-block={b.id}>
                    <span className="w-16 shrink-0 whitespace-nowrap tabular-nums" style={{ color: 'var(--text-faint)' }}>
                      {b.at ? new Date(b.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    <span className="w-12 shrink-0 font-medium tabular-nums">{hm(b.minutes)}</span>
                    <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-dim)' }}>{b.topic ?? 'Study'}</span>
                    <button type="button" onClick={() => remove(b.id)} aria-label="Remove this block"
                      className="opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--text-faint)' }}>✕</button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </>
      )}
    </Card>
  );
}
