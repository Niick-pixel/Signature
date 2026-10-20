'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { springSoft, exitQuick } from '@/lib/motion';
import { localDay } from '@/lib/day';
import type { FocusStatus } from '@/lib/review';

export interface FocusData { focus: FocusStatus | null; options: Array<{ id: string; short: string; text: string }> }

/**
 * One rule for the week. Shows the streak of trades that kept it and the
 * week so far; click to choose another. Defaults to the rule behind the #1 leak.
 */
export function FocusPill({ data, onChanged }: { data: FocusData | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  if (!data?.focus) return null;
  const f = data.focus;
  async function choose(ruleId: string) {
    setOpen(false);
    await fetch('/api/review/focus', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ today: localDay(), ruleId }) });
    onChanged();
  }
  return (
    <div className="relative" data-focus-pill={f.ruleId}>
      <button type="button" onClick={() => setOpen((o) => !o)} title={`${f.text}${f.chosen ? '' : ' — the rule behind your #1 leak. Click to choose another.'}`}
        className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px]"
        style={{ background: 'color-mix(in srgb, var(--bg-raised) 95%, transparent)', borderColor: 'rgb(var(--accent) / 0.4)' }}>
        <span className="font-semibold" style={{ color: 'rgb(var(--accent))' }}>This week:</span>
        <span>{f.short}</span>
        <span className="tabular-nums" style={{ color: 'var(--text-faint)' }}>
          · kept {f.streak} in a row{f.week.kept + f.week.broken > 0 ? ` · this week ${f.week.kept}/${f.week.kept + f.week.broken}` : ''}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }} transition={springSoft}
            className="glass absolute bottom-full left-0 mb-2 max-h-[60vh] w-[19rem] overflow-y-auto rounded-[calc(16px*var(--rk))] p-1.5"
            style={{ background: 'color-mix(in srgb, var(--bg-raised) 98%, transparent)' }}>
            <li className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Focus this week on</li>
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
