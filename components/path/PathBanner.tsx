'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { navigate } from '@/lib/nav';
import { press, spring } from '@/lib/motion';
import { BOARD_SHOWN } from '@/lib/keys';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import type { PathSummary } from '@/lib/pathSummary';

/** Fetch the Path summary, and keep it current as trades are logged. */
export function usePathSummary(initial: PathSummary | null = null): PathSummary | null {
  const [summary, setSummary] = useState<PathSummary | null>(initial);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/path?summary=1').then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (alive && s) setSummary(s); }).catch(() => {});
    void load();
    const events = [BOARD_SHOWN, JOURNAL_CHANGED, 'focus'];
    for (const e of events) window.addEventListener(e, load);
    return () => { alive = false; for (const e of events) window.removeEventListener(e, load); };
  }, []);
  return summary;
}

/**
 * The step I am on, always in sight: "Step 1 of 6 · Backtest sample ·
 * 14 / 50 graded before outcome". Clicking it opens the Path.
 */
export function PathBanner({ summary: given, compact = false }: { summary?: PathSummary | null; compact?: boolean }) {
  const fetched = usePathSummary();
  const summary = given ?? fetched;
  if (!summary?.banner) return null;
  return (
    <motion.button
      type="button"
      data-path-banner
      initial={false}
      whileTap={press}
      transition={spring}
      onClick={() => navigate('/path')}
      title={summary.step ? `Next: ${summary.step.nextAction}` : 'Every step is done'}
      className={`glass pointer-events-auto flex max-w-full items-center gap-2 rounded-full ${compact ? 'px-3 py-1 text-[11px]' : 'px-3.5 py-1.5 text-[11.5px]'}`}
      style={{ borderColor: 'rgb(var(--accent) / 0.4)', boxShadow: 'var(--shadow-card), 0 0 18px -8px rgb(var(--accent) / 0.55)' }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: 'rgb(var(--accent))', boxShadow: '0 0 8px rgb(var(--accent) / 0.8)' }} />
      <span className="truncate tabular-nums" style={{ color: 'var(--text-dim)' }}>{summary.banner}</span>
    </motion.button>
  );
}
