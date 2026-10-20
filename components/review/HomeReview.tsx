'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { springSoft, exitQuick, press, spring } from '@/lib/motion';
import { localDay } from '@/lib/day';
import { BOARD_SHOWN } from '@/lib/keys';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import type { BeforeYouTrade, CloseLine, SessionStrip } from '@/lib/review';
import { SessionStripView } from './SessionStripView';
import { FocusPill, type FocusData } from './FocusPill';

type Today =
  | { mode: 'before'; before: BeforeYouTrade }
  | { mode: 'close'; close: CloseLine[]; trades: number }
  | { mode: null };

const FOLD_KEY = 'signature:home-review-folded';
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * On the board, two cards from the review engine (lib/review):
 *   Before you trade — on a day with nothing logged yet: the #1 leak and its
 *     rule, what the last session broke, how long since the #1 rule went.
 *   Session close — once today's trades are all settled: three lines at most.
 * Folds to a pill for the rest of the day; never a dialog.
 */
export function HomeReview() {
  const path = usePathname();
  const [data, setData] = useState<Today | null>(null);
  const [folded, setFolded] = useState(false);

  const [strip, setStrip] = useState<SessionStrip | null>(null);
  const [focus, setFocus] = useState<FocusData | null>(null);
  const load = useCallback(() => {
    const today = localDay();
    const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    void get(`/api/review/today?today=${today}`).then((r: Today | null) => {
      setData(r);
      try { setFolded(window.localStorage.getItem(FOLD_KEY) === `${today}:${r?.mode}`); } catch { /* shown */ }
    });
    void get(`/api/review/strip?today=${today}`).then(setStrip);
    void get(`/api/review/focus?today=${today}`).then(setFocus);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(load, 1200);
    const events = [BOARD_SHOWN, JOURNAL_CHANGED, 'focus'];
    for (const e of events) window.addEventListener(e, load);
    return () => { window.clearTimeout(t); for (const e of events) window.removeEventListener(e, load); };
  }, [load]);

  const fold = (v: boolean) => {
    setFolded(v);
    try { if (v && data?.mode) window.localStorage.setItem(FOLD_KEY, `${localDay()}:${data.mode}`); else window.localStorage.removeItem(FOLD_KEY); } catch { /* fine */ }
  };

  const visible = data?.mode != null
    && (data.mode === 'close' ? data.close.length > 0 : Boolean(data.before.leak || data.before.lastSession || data.before.topRule));
  const title = data?.mode === 'close' ? 'Session close' : 'Before you trade';

  if (path !== '/') return null;
  return (
    // The board's bottom-left column: today's strip, the week's focus, then the card.
    <div data-home-column className="pointer-events-none fixed bottom-[7.5rem] left-6 z-[44] flex w-[min(21rem,calc(100vw-3rem))] flex-col items-start gap-2 [&>*]:pointer-events-auto">
    <SessionStripView strip={strip} />
    <FocusPill data={focus} onChanged={load} />
    <AnimatePresence>
      {visible && (folded ? (
        <motion.button key="pill" type="button" data-home-review="folded" onClick={() => fold(false)}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }} transition={springSoft}
          whileTap={press}
          className="glass rounded-full px-3.5 py-1.5 text-[11.5px] font-medium"
          style={{ color: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent) / 0.4)' }}>
          {title}
        </motion.button>
      ) : (
        <motion.section key="card" data-home-review={data!.mode}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8, transition: exitQuick }} transition={springSoft}
          className="glass w-full rounded-[calc(20px*var(--rk))] p-4"
          style={{ background: 'color-mix(in srgb, var(--bg-raised) 95%, transparent)', borderColor: 'rgb(var(--accent) / 0.35)',
            boxShadow: 'var(--shadow-panel), 0 0 26px -12px rgb(var(--accent) / 0.55)' }}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[13.5px] font-semibold tracking-tight">{title}</h2>
            <motion.button type="button" onClick={() => fold(true)} whileTap={press} transition={spring}
              className="text-[11px]" style={{ color: 'var(--text-faint)' }} aria-label="Fold">Fold</motion.button>
          </div>
          {data!.mode === 'before' ? <Before b={data!.before} /> : <Close lines={(data as { close: CloseLine[] }).close} />}
        </motion.section>
      ))}
    </AnimatePresence>
    </div>
  );
}

function Before({ b }: { b: BeforeYouTrade }) {
  return (
    <div className="mt-2.5 space-y-3 text-[12px] leading-snug">
      {b.leak ? (
        <div data-before-leak>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'rgb(var(--accent))' }}>#1 leak</div>
          <div className="font-medium">{b.leak.title} <span className="tabular-nums" style={{ color: 'rgb(var(--outcome-loss))' }}>{b.leak.netR.toFixed(1)}R</span></div>
          <div className="mt-1" style={{ color: 'var(--text-dim)' }}>{b.leak.rule}</div>
        </div>
      ) : b.leakWaiting && <p style={{ color: 'var(--text-faint)' }}>{b.leakWaiting}</p>}
      {b.lastSession && (
        <div data-before-last>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
            Last session · {day(b.lastSession.day)} · {b.lastSession.trades} trade{b.lastSession.trades === 1 ? '' : 's'}
          </div>
          {b.lastSession.broken.length === 0 ? <div style={{ color: 'rgb(var(--outcome-win))' }}>Every rule kept.</div> : (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {b.lastSession.broken.map((x) => (
                <span key={x.short} className="rounded-full border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: 'rgb(var(--outcome-loss) / 0.3)', color: 'rgb(var(--outcome-loss))' }}>
                  {x.short}{x.count > 1 ? ` ×${x.count}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {b.topRule && (
        <div data-before-rule>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>
            {b.topRule.linked ? 'The rule behind it' : 'Your costliest rule'}
          </div>
          <div>{b.topRule.text} <span style={{ color: b.topRule.daysSince == null ? 'rgb(var(--outcome-win))' : 'var(--text-faint)' }}>
            {b.topRule.daysSince == null ? '— never broken'
              : b.topRule.daysSince === 0 ? '— broken today'
              : `— last broken ${b.topRule.daysSince} day${b.topRule.daysSince === 1 ? '' : 's'} ago`}
          </span></div>
        </div>
      )}
    </div>
  );
}

const KIND = { broken: { label: 'Rule broken', hue: '--outcome-loss' }, paid: { label: 'Habit that paid', hue: '--outcome-win' }, watch: { label: 'To watch', hue: '--amber' } } as const;

function Close({ lines }: { lines: CloseLine[] }) {
  return (
    <ul className="mt-2.5 space-y-2.5 text-[12px] leading-snug" data-close-lines={lines.length}>
      {lines.map((l) => (
        <li key={l.kind}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: `rgb(var(${KIND[l.kind].hue}))` }}>{KIND[l.kind].label}</div>
          <div className="font-medium">{l.text}</div>
          <div style={{ color: 'var(--text-dim)' }}>{l.detail}</div>
        </li>
      ))}
    </ul>
  );
}
