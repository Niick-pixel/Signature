'use client';

import { useEffect, useState } from 'react';

export type DrillKept = 'kept' | 'broken' | 'n/a';

/**
 * The active drill from Work on, asked on every trade while it runs:
 * "Drill: ‹text›" — Kept / Broken / N/A. Empty until answered, never a gate;
 * a second tap clears it. Shown only when a drill is active (or, editing,
 * when the trade was logged under one).
 */
export function DrillChip({ drillKey, value, onChange }: {
  drillKey: string | null;
  value: DrillKept | null;
  onChange: (key: string | null, kept: DrillKept | null) => void;
}) {
  const [drill, setDrill] = useState<{ key: string; drill: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(drillKey ? `/api/flaws?key=${encodeURIComponent(drillKey)}` : '/api/flaws')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { key: string; drill: string } | null) => {
        if (!live || !d) return;
        setDrill(d);
        if (!drillKey) onChange(d.key, null);
      })
      .catch(() => {});
    return () => { live = false; };
    // Once per form: the drill does not change while a trade is being written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!drill) return null;
  const OPTIONS: { v: DrillKept; label: string; tone: string }[] = [
    { v: 'kept', label: 'Kept', tone: '--outcome-win' },
    { v: 'broken', label: 'Broken', tone: '--outcome-loss' },
    { v: 'n/a', label: 'N/A', tone: '--text-faint' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[calc(14px*var(--rk))] border px-3 py-2"
      style={{ borderColor: 'rgb(var(--outcome-win) / 0.35)', background: 'rgb(var(--outcome-win) / 0.05)' }}
      data-drill-chip={value ?? 'unset'}>
      <span className="min-w-0 flex-1 text-[12.5px]">
        <b className="font-semibold" style={{ color: 'rgb(var(--outcome-win))' }}>Drill:</b>{' '}
        <span className="line-clamp-2" title={drill.drill}>{drill.drill}</span>
      </span>
      <div role="radiogroup" aria-label="The drill on this trade" className="flex gap-1">
        {OPTIONS.map((o) => {
          const on = value === o.v;
          const c = o.tone === '--text-faint' ? 'var(--text-dim)' : `rgb(var(${o.tone}))`;
          return (
            <button key={o.v} type="button" role="radio" aria-checked={on}
              onClick={() => onChange(drill.key, on ? null : o.v)}
              className="rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold transition-colors"
              style={on
                ? { borderColor: c, color: c, background: o.tone === '--text-faint' ? 'var(--glass-fill-strong)' : `rgb(var(${o.tone}) / 0.12)` }
                : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
