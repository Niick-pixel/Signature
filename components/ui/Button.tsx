'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { press, spring } from '@/lib/motion';

type Variant = 'primary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'text-[color:var(--bg)]',
  ghost: 'text-[color:var(--text)]',
  danger: 'text-[rgb(248_113_113)]',
};

export function Button({
  variant = 'ghost',
  accent = 'var(--accent)',
  className = '',
  children,
  ...rest
}: React.ComponentProps<typeof motion.button> & { variant?: Variant; accent?: string }) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const [lit, setLit] = useState(false);

  // Ghost and danger buttons take the same colour their text does, so the glow
  // reads as the button's own identity rather than a generic highlight.
  const glowColor = isDanger ? 'var(--outcome-loss)' : accent;

  return (
    <motion.button
      initial={false}
      type="button"
      whileTap={press}
      whileHover={{ y: -1 }}
      onHoverStart={() => setLit(true)}
      onHoverEnd={() => setLit(false)}
      onFocus={() => setLit(true)}
      onBlur={() => setLit(false)}
      animate={{
        borderColor: isPrimary
          ? 'rgba(0,0,0,0)'
          : lit ? `rgb(${glowColor} / 0.5)` : 'var(--glass-stroke)',
        boxShadow: isPrimary
          ? `0 8px 24px -8px rgb(${accent} / ${lit ? 0.85 : 0.6}), 0 0 ${lit ? 26 : 0}px rgb(${accent} / 0.4)`
          : lit
            ? `var(--shadow-card), 0 0 20px rgb(${glowColor} / 0.3)`
            : 'var(--shadow-card), 0 0 0px rgb(0 0 0 / 0)',
      }}
      transition={spring}
      className={`ui-btn relative select-none rounded-[calc(14px*var(--rk))] border px-5 py-2.5 text-[13px] font-medium
        outline-none disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      style={{
        background: isPrimary ? `rgb(${accent})` : 'var(--glass-fill)',
        backdropFilter: isPrimary ? undefined : 'var(--glass-blur)',
      }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
