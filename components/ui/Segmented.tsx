'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';
import { press, spring, springSoft } from '@/lib/motion';

interface SegmentedProps<T extends string> {
  /** Null: nothing chosen yet — no option is highlighted. */
  value: T | null;
  onChange: (value: T) => void;
  options: readonly T[];
  /** Per-option colour, e.g. outcome hues. */
  accentFor?: (option: T) => string;
  labelFor?: (option: T) => string;
  /** Hover text per option, for the places where the label alone is cryptic. */
  titleFor?: (option: T) => string;
  /** One row whatever the width, smaller type — for a narrow column of short answers. */
  compact?: boolean;
}

/**
 * A row of choices, all visible at once. Used where the answer is already known
 * and a dropdown would just hide it behind a click — the trade's outcome, most
 * of all, which you know before you start writing anything down.
 */
export function Segmented<T extends string>({
  value, onChange, options, accentFor, labelFor, titleFor, compact = false,
}: SegmentedProps<T>) {
  // One highlight per control, gliding to whichever option is picked rather
  // than one fading out while another fades in.
  const pill = useId();
  return (
    <div className={`glass flex rounded-[calc(16px*var(--rk))] p-1 ${compact ? 'gap-0.5' : 'flex-wrap gap-1'}`}>
      {options.map((option) => {
        const active = option === value;
        const accent = accentFor?.(option) ?? 'var(--accent)';
        return (
          <motion.button
      initial={false}
            key={option}
            type="button"
            title={titleFor?.(option)}
            aria-pressed={active}
            onClick={() => onChange(option)}
            whileTap={press}
            animate={{ color: active ? `rgb(${accent})` : 'var(--text-dim)' }}
            transition={spring}
            className={`relative min-w-0 flex-1 rounded-[calc(12px*var(--rk))] font-medium whitespace-nowrap ${compact ? 'px-1 py-[7px] text-[11.5px]' : 'px-3 py-2 text-[12px]'}`}
          >
            {active && (
              <motion.span
                layoutId={pill}
                aria-hidden
                className="absolute inset-0 rounded-[calc(12px*var(--rk))] border"
                initial={false}
                animate={{
                  background: `rgb(${accent} / 0.16)`,
                  borderColor: `rgb(${accent} / 0.5)`,
                  boxShadow: `0 0 18px rgb(${accent} / 0.22)`,
                }}
                transition={springSoft}
              />
            )}
            <span className="relative">{labelFor?.(option) ?? option}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
