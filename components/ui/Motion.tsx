'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { exitQuick, springSoft } from '@/lib/motion';

/**
 * The two movements the app reuses everywhere something opens or changes,
 * so every panel feels the same. Both follow the reduce-motion setting
 * (MotionConfig in PreferencesProvider): with it on they simply appear.
 */

/**
 * Opens and closes in place: the height eases open on a soft spring while
 * the content fades and rises a few pixels; closing is quicker than opening,
 * as things leave faster than they arrive.
 */
export function Reveal({ open, children, className = '', ...rest }: { open: boolean; children: React.ReactNode; className?: string } & Record<`data-${string}`, string | undefined>) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div key="reveal" {...rest}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1, transition: { height: springSoft, opacity: { duration: 0.18, delay: 0.04 } } }}
          exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }, opacity: exitQuick } }}
          style={{ overflow: 'hidden' }}>
          <motion.div className={className} initial={{ y: -6 }} animate={{ y: 0 }} exit={{ y: -4 }} transition={springSoft}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Content that swaps for other content in the same place — a tab, a week, a
 * category: the old fades out quickly, the new rises in on a spring. `k` is
 * what changed (the tab's id).
 */
export function SwapIn({ k, children, className = '', dir = 0 }: { k: string; children: React.ReactNode; className?: string; dir?: -1 | 0 | 1 }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={k} className={className}
        initial={{ opacity: 0, y: dir ? 0 : 8, x: dir * 14 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: dir ? 0 : -4, x: dir * -10, transition: exitQuick }}
        transition={springSoft}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** A small popover (menus over a button): springs from its corner, leaves quickly. */
export function Pop({ open, children, className = '', origin = 'bottom right', style, ...rest }: {
  open: boolean; children: React.ReactNode; className?: string; origin?: string; style?: React.CSSProperties;
} & Record<`data-${string}`, string | undefined> & { onClick?: (e: React.MouseEvent) => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div {...rest} className={className} style={{ ...style, transformOrigin: origin }}
          initial={{ opacity: 0, scale: 0.94, y: origin.startsWith('bottom') ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, transition: exitQuick }}
          transition={springSoft}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
