'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { navigate } from '@/lib/nav';
import { springSoft, exitQuick } from '@/lib/motion';
import { localDay } from '@/lib/day';

interface Pending { day: string; world: 'real' | 'backtest'; netR: number; trades: number }
const LATER_KEY = 'signature:red-day-later';

/**
 * After a red day, the next time the app opens: a quiet card, not a dialog —
 * "You had a red day on Tue 14 Oct. Write the page." It opens a page already
 * laid out (what I saw, what I did, the rule, one if-then) with the day's
 * trades listed. "Not now" holds it off for the rest of today; "Skip this
 * day" never asks about it again.
 */
export function RedDayPrompt() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { if (window.localStorage.getItem(LATER_KEY) === localDay()) return; } catch { /* ask anyway */ }
    let alive = true;
    const t = window.setTimeout(() => {
      fetch(`/api/redday?today=${localDay()}`).then((r) => (r.ok ? r.json() : null))
        .then((r) => { if (alive && r?.prompt) setPending(r.prompt); }).catch(() => {});
    }, 2500);
    return () => { alive = false; window.clearTimeout(t); };
  }, []);

  async function skip() {
    if (!pending) return;
    setPending(null);
    await fetch('/api/redday', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: pending.day, world: pending.world, skip: true }) }).catch(() => {});
  }
  const later = () => { try { window.localStorage.setItem(LATER_KEY, localDay()); } catch { /* fine */ } setPending(null); };
  async function write() {
    if (!pending) return;
    setBusy(true);
    const res = await fetch('/api/redday', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: pending.day, world: pending.world }) });
    setBusy(false);
    const r = await res.json().catch(() => null);
    setPending(null);
    if (r?.pageId) navigate(`/journal?page=${r.pageId}`);
  }

  const when = pending ? new Date(`${pending.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  return (
    <AnimatePresence>
      {pending && (
        <motion.div data-red-day-prompt
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10, transition: exitQuick }} transition={springSoft}
          className="glass fixed bottom-6 left-1/2 z-[45] flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-[calc(20px*var(--rk))] px-5 py-3.5"
          style={{ background: 'color-mix(in srgb, var(--bg-raised) 96%, transparent)', borderColor: 'rgb(var(--outcome-loss) / 0.35)', boxShadow: 'var(--shadow-panel), 0 0 26px -12px rgb(var(--outcome-loss) / 0.6)' }}>
          <div className="min-w-0 text-[13px] leading-snug">
            <b>You had a red day on {when}.</b> Write the page.
            <div className="mt-0.5 text-[11.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
              {pending.netR}R over {pending.trades} trade{pending.trades === 1 ? '' : 's'}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => void skip()} data-red-day-skip title="Never ask about this day again — counted as skipped on the Path.">Skip this day</Button>
            <Button onClick={later}>Not now</Button>
            <Button variant="primary" onClick={() => void write()} disabled={busy} data-red-day-write>Write the page</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
