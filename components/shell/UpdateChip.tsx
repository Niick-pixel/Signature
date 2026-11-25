'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { press, spring, exitQuick } from '@/lib/motion';

/**
 * "Restart to update", once a new version has downloaded. Nothing shows while
 * it checks or downloads — updating is meant to be something you notice only
 * when it is ready. Closing the app installs it too; this is for now.
 */
export function UpdateChip() {
  const [ready, setReady] = useState<string | null>(null);

  useEffect(() => {
    const u = window.signature?.updates;
    if (!u) return;
    u.state().then((s) => { if (s.state === 'ready') setReady(s.next ?? ''); }).catch(() => {});
    return u.onChange((s) => setReady(s.state === 'ready' ? s.next ?? '' : null));
  }, []);

  return (
    <AnimatePresence>
      {ready !== null && (
        <motion.button
          type="button"
          data-update-ready
          onClick={() => window.signature?.updates.install()}
          whileTap={press}
          whileHover={{ y: -1 }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4, transition: exitQuick }}
          transition={spring}
          title="A new version has downloaded. Restart to use it — or it installs when you next close Signature."
          className="bar-ctl mr-2" data-bar="action"
          style={{ borderColor: 'rgb(var(--outcome-win) / 0.5)', background: 'rgb(var(--outcome-win) / 0.1)', color: 'rgb(var(--outcome-win))' }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Update ready{ready ? ` · ${ready}` : ''} — restart
        </motion.button>
      )}
    </AnimatePresence>
  );
}
