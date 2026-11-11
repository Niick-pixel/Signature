'use client';

import { useEffect, useState } from 'react';

/**
 * Beside the checklist: the boxes you tick on nearly every trade. A box that
 * is always yes isn't checking anything, so the grade can't separate setups.
 * A note, never a gate: it asks one question and changes nothing.
 */
export function FilterNote() {
  const [d, setD] = useState<{ n: number; items: Array<{ label: string; share: number | null }> } | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/checklist-spread').then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j) setD(j); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!d?.items.length) return null;
  return (
    <p className="mt-2 rounded-[calc(12px*var(--rk))] px-3 py-2 text-[11.5px] leading-snug" data-filter-note={d.items.length}
      style={{ background: 'rgb(var(--amber) / 0.08)', color: 'var(--text-dim)' }}>
      <b className="font-semibold" style={{ color: 'var(--text)' }}>Ticked on almost every one of your last {d.n} trades:</b>{' '}
      {d.items.map((i) => `${i.label}${i.share != null ? ` (${Math.round(i.share * 100)}%)` : ''}`).join(', ')}.
      {' '}Look at this chart again for each: would you really have passed on the trade without it? If a box can never be left empty, it isn’t a check.
    </p>
  );
}
