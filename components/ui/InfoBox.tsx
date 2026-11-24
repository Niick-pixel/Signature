'use client';

import type { ReactNode } from 'react';
import { Field } from '@/components/ui/Field';

/**
 * A value the plan works out or holds fixed, never tapped: a square, dashed box with an "auto" mark, so it
 * reads as information beside the tap rows, not as one more row to answer.
 */
export function InfoBox({ label, hint, tone, accent = false, mark = 'auto', children, ...data }: {
  label: string; hint?: string; tone?: string; accent?: boolean;
  /** The tag in the corner: "auto" for a derived value, "rule" for one fixed by the strategy. */
  mark?: string; children: ReactNode; [k: `data-${string}`]: string;
}) {
  const ring = tone ? `rgb(${tone} / 0.45)` : accent ? 'rgb(var(--accent) / 0.4)' : 'var(--glass-stroke)';
  const fill = tone ? `rgb(${tone} / 0.08)` : accent ? 'rgb(var(--accent) / 0.07)' : 'rgb(var(--accent) / 0.03)';
  return (
    <div className="p-1" {...data}>
      <Field quiet label={label} hint={hint}>
        <div className="flex min-h-[2.5rem] items-center gap-2.5 rounded-[calc(10px*var(--rk))] border border-dashed px-3 py-1.5" style={{ borderColor: ring, background: fill }}>
          <span className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
            style={{ color: tone ? `rgb(${tone})` : 'rgb(var(--accent))', background: tone ? `rgb(${tone} / 0.12)` : 'rgb(var(--accent) / 0.12)' }} aria-hidden>{mark}</span>
          <span className="min-w-0 flex-1">{children}</span>
        </div>
      </Field>
    </div>
  );
}
