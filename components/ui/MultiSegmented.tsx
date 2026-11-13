'use client';

import { motion } from 'framer-motion';
import { press, spring, springSoft } from '@/lib/motion';

/**
 * Segmented, for more than one answer: the same glass track and the same
 * lit pill, on every option picked. `max` keeps the newest picks.
 */
export function MultiSegmented<T extends string>({
  value, onChange, options, max, accentFor, labelFor, titleFor,
}: {
  value: readonly T[];
  onChange: (value: T[]) => void;
  options: readonly T[];
  max?: number;
  accentFor?: (option: T) => string | undefined;
  labelFor?: (option: T) => string;
  titleFor?: (option: T) => string | undefined;
}) {
  const tap = (o: T) => {
    if (value.includes(o)) { onChange(value.filter((x) => x !== o)); return; }
    const next = [...value, o];
    onChange(max && next.length > max ? next.slice(next.length - max) : next);
  };
  return (
    <div className="glass flex flex-wrap gap-1 rounded-[calc(16px*var(--rk))] p-1" role="group">
      {options.map((option) => {
        const active = value.includes(option);
        const accent = accentFor?.(option) ?? 'var(--accent)';
        return (
          <motion.button
            initial={false}
            key={option}
            type="button"
            title={titleFor?.(option)}
            aria-pressed={active}
            data-option={option}
            onClick={() => tap(option)}
            whileTap={press}
            animate={{ color: active ? `rgb(${accent})` : 'var(--text-dim)' }}
            transition={spring}
            className="relative flex-[1_0_auto] whitespace-nowrap rounded-[calc(12px*var(--rk))] px-3 py-2 text-[12px] font-medium"
          >
            {active && (
              <motion.span aria-hidden className="absolute inset-0 rounded-[calc(12px*var(--rk))] border" initial={{ opacity: 0 }}
                animate={{ opacity: 1, background: `rgb(${accent} / 0.16)`, borderColor: `rgb(${accent} / 0.5)`, boxShadow: `0 0 18px rgb(${accent} / 0.22)` }}
                transition={springSoft} />
            )}
            <span className="relative">{labelFor?.(option) ?? option}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
