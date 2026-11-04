'use client';

import { motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { RINGS, type DayRings, type RingId } from '@/lib/consistency';

/** One colour per ring, from the theme. */
export const RING_COLOR: Record<RingId, string> = {
  prep: 'rgb(var(--accent))',
  rules: 'rgb(var(--outcome-win))',
  journal: 'rgb(var(--series-a))',
  // Blue and red mixed: a violet that stays apart from the other three in every theme.
  review: 'color-mix(in srgb, rgb(var(--series-a)) 55%, rgb(var(--outcome-loss)))',
};

/**
 * The day's four rings, outside in: Prep, Rules, Journal, Review. A closed
 * ring is a full circle; an open one a faint track; one that does not apply
 * (no trades: nothing to journal) a fainter one.
 */
export function Rings({ day, size = 76, stroke }: { day: Pick<DayRings, 'rings'>; size?: number; stroke?: number }) {
  const w = stroke ?? Math.max(2, size / 11);
  const gap = w * 0.35;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      {RINGS.map((r, i) => {
        const rad = size / 2 - w / 2 - i * (w + gap);
        if (rad <= w / 2) return null;
        const c = 2 * Math.PI * rad;
        const state = day.rings[r.id];
        return (
          <g key={r.id}>
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={RING_COLOR[r.id]} strokeOpacity={state === 'na' ? 0.06 : 0.16} strokeWidth={w} />
            {state === 'done' && (
              <motion.circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={RING_COLOR[r.id]} strokeWidth={w} strokeLinecap="round"
                strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: 0 }} transition={{ ...spring, delay: i * 0.06 }} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** The legend beside the rings: each ring with done / open / not today. */
export function RingLegend({ day }: { day: Pick<DayRings, 'rings'> }) {
  return (
    <ul className="space-y-0.5 text-[11.5px]">
      {RINGS.map((r) => {
        const s = day.rings[r.id];
        return (
          <li key={r.id} className="flex items-center gap-1.5" title={r.hint} data-ring={r.id} data-ring-state={s}>
            <span className="size-2 rounded-full" style={{ background: RING_COLOR[r.id], opacity: s === 'done' ? 1 : 0.3 }} />
            <span style={{ color: s === 'done' ? 'var(--text)' : 'var(--text-dim)' }}>{r.label}</span>
            <span className="ml-auto" style={{ color: 'var(--text-faint)' }}>{s === 'done' ? '✓' : s === 'na' ? 'no trades' : 'open'}</span>
          </li>
        );
      })}
    </ul>
  );
}
