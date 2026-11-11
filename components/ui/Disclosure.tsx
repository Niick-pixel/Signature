'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Collapse } from '@/components/ui/Collapse';
import { press, spring } from '@/lib/motion';

/** Collapsed extra fields. Expands on a height spring, never a duration. */
export function Disclosure({
  label, children, defaultOpen = false,
}: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileTap={press}
        transition={spring}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-1 text-[13px] font-medium"
        style={{ color: 'var(--text-dim)' }}
      >
        <motion.svg
          width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden
          animate={{ rotate: open ? 180 : 0 }} transition={spring}
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
        {label}
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <Collapse key="body">
            <div className="pt-5">{children}</div>
          </Collapse>
        )}
      </AnimatePresence>
    </div>
  );
}
