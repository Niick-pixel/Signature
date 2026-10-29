'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { press, spring, exitQuick } from '@/lib/motion';

/**
 * The primary action, bottom-right, above the board controls.
 *
 * It sat in the title bar next to the window buttons, which is the one strip
 * the eye skips and the OS is already using. Down here it is unmissable and
 * carries the accent colour, which nothing else in the chrome does.
 */
export function NewTradeButton() {
  const pathname = usePathname();
  // Hidden while you are already capturing a trade.
  const hidden = pathname === '/new';

  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97, transition: exitQuick }}
          transition={spring}
          whileTap={press}
          whileHover={{ y: -2 }}
          className="fixed bottom-[62px] right-4 z-30 transition-[right] duration-300"
          data-new-trade-fab
        >
          <Link
            href="/new"
            className="flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold outline-none"
            style={{
              background: 'rgb(var(--accent))',
              color: 'var(--bg-raised)',
              border: '1px solid rgb(var(--accent))',
              boxShadow: '0 8px 24px -8px rgb(var(--accent) / 0.75), 0 0 26px rgb(var(--accent) / 0.35)',
            }}
          >
            <span className="text-[15px] leading-none">+</span> New trade
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
