'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { springSoft, exitQuick, press, spring } from '@/lib/motion';
import { localDay } from '@/lib/day';
import { BOARD_SHOWN } from '@/lib/keys';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import type { BeforeYouTrade, CloseLine, SessionStrip } from '@/lib/review';
import { SessionStripView } from './SessionStripView';
import { FocusPill, type FocusData } from './FocusPill';
import { CloseX } from './CloseX';
import { Overlay } from '@/components/ui/Overlay';

type Today =
  | { mode: 'before'; before: BeforeYouTrade }
  | { mode: 'close'; close: CloseLine[]; trades: number }
  | { mode: null };

const FOLD_KEY = 'signature:home-review-folded';
const HIDE_KEY = 'signature:home-review-hidden';
const MIN_KEY = 'signature:home-review-open';
const SEEN_KEY = 'signature:home-review-seen';
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * On the Dashboard, folded into one button by default (it lit up the board
 * too much), two cards from the review engine (lib/review):
 *   Before you trade — on a day with nothing logged yet: the #1 leak and its
 *     rule, what the last session broke, how long since the #1 rule went.
 *   Session close — once today's trades are all settled: three lines at most.
 * Folds to a pill for the rest of the day; never a dialog. The button
 * fills with the accent and pulses when something changed since you last
 * opened it.
 */
export function HomeReview({ sheet = false }: { sheet?: boolean }) {
  const [data, setData] = useState<Today | null>(null);
  const [folded, setFolded] = useState(false);

  // Hidden for today, per item (strip, focus, card); the whole column minimized until reopened.
  const [hidden, setHidden] = useState<string[]>([]);
  const [minimized, setMinimized] = useState(true);
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(HIDE_KEY) ?? 'null') as { day: string; items: string[] } | null;
      if (raw?.day === localDay()) setHidden(raw.items);
      setMinimized(window.localStorage.getItem(MIN_KEY) !== '1');
      setSeen(window.localStorage.getItem(SEEN_KEY));
    } catch { /* shown */ }
  }, []);
  const hide = (item: string) => setHidden((h) => {
    const next = [...new Set([...h, item])];
    try { window.localStorage.setItem(HIDE_KEY, JSON.stringify({ day: localDay(), items: next })); } catch { /* fine */ }
    return next;
  });
  const minimize = (v: boolean) => {
    setMinimized(v);
    try { if (v) window.localStorage.removeItem(MIN_KEY); else window.localStorage.setItem(MIN_KEY, '1'); } catch { /* fine */ }
  };
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

  // What is in it, in a few words: when this changes, the button lights up until opened.
  const signature = JSON.stringify([data?.mode ?? null,
    data?.mode === 'before' ? [data.before.leak?.title, data.before.lastSession?.day, data.before.lastSession?.broken.length, data.before.topRule?.daysSince] : null,
    data?.mode === 'close' ? data.close.map((l) => l.text) : null,
    focus?.focus ? [focus.focus.ruleId, focus.focus.week.broken] : null, strip?.trades ?? null]);
  const fresh = data != null && seen !== signature;
  const markSeen = () => { setSeen(signature); try { window.localStorage.setItem(SEEN_KEY, signature); } catch { /* fine */ } };
  // Seen while open: whatever arrives while you are looking at it is not news.
  useEffect(() => { if (!minimized && data != null && seen !== signature) markSeen(); });

  const stripShows = Boolean(strip && (strip.trades > 0 || strip.redFolder));
  const anything = (stripShows && !hidden.includes('strip')) || (focus?.focus && !hidden.includes('focus')) || (visible && !hidden.includes('card'));
  if (!anything) return null;
  if (minimized && !sheet) {
    return (
      <div data-home-column="minimized" className="relative">
        <motion.button type="button" onClick={() => { minimize(false); markSeen(); }} data-home-restore={fresh ? 'new' : 'seen'}
          whileTap={press} whileHover={{ y: -1 }} transition={spring}
          className="flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11.5px] font-semibold"
          style={fresh
            ? { background: 'rgb(var(--accent))', borderColor: 'transparent', color: 'var(--bg-raised)', boxShadow: 'var(--shadow-card), 0 0 22px -6px rgb(var(--accent) / 0.8)' }
            : { background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)', boxShadow: 'var(--shadow-card)' }}>
          {fresh && (
            <span className="relative flex size-2">
              <span className="checkin-ping absolute inset-0 rounded-full" style={{ background: 'var(--bg-raised)' }} />
              <span className="relative size-2 rounded-full" style={{ background: 'var(--bg-raised)' }} />
            </span>
          )}
          {fresh ? `${title} · new` : title} ▾
        </motion.button>
      </div>
    );
  }
  return (
    // In its window (from the bell): today's strip, the week's focus, then the card — no button, no dropdown.
    sheet ? (
      <div data-home-column="sheet" className="flex flex-col items-stretch gap-2">
        {!hidden.includes('strip') && <SessionStripView strip={strip} onHide={() => hide('strip')} />}
        {!hidden.includes('focus') && <FocusPill data={focus} onChanged={load} />}
        {visible && data?.mode === 'before' && <section className="glass rounded-[calc(18px*var(--rk))] p-4" data-home-review="before"><Before b={data.before} /></section>}
        {visible && data?.mode === 'close' && <section className="glass rounded-[calc(18px*var(--rk))] p-4" data-home-review="close"><Close lines={data.close} /></section>}
        {!visible && <p className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>Nothing to show right now — trades in progress.</p>}
      </div>
    ) :
    <div className="relative">
    <button type="button" onClick={() => minimize(true)} data-home-fold
      className="rounded-full border px-3.5 py-1.5 text-[11.5px] font-semibold"
      style={{ background: 'rgb(var(--accent) / 0.12)', borderColor: 'rgb(var(--accent) / 0.4)', color: 'rgb(var(--accent))' }}>
      {title} ▾
    </button>
    <motion.div data-home-column initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={springSoft}
      style={{ transformOrigin: 'top right' }}
      className="absolute right-0 top-[calc(100%+8px)] z-[45] flex w-[min(22rem,calc(100vw-2rem))] flex-col items-end gap-2">
    {!hidden.includes('strip') && <SessionStripView strip={strip} onHide={() => hide('strip')} />}
    {!hidden.includes('focus') && <FocusPill data={focus} onChanged={load} onHide={() => hide('focus')} />}
    <AnimatePresence>
      {visible && !hidden.includes('card') && (folded ? (
        <motion.button key="pill" type="button" data-home-review="folded" onClick={() => fold(false)}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: exitQuick }} transition={springSoft}
          whileTap={press}
          className="glass rounded-full px-3.5 py-1.5 text-[11.5px] font-medium"
          style={{ color: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent) / 0.4)' }}>
          {title} ▴
        </motion.button>
      ) : (
        <motion.section key="card" data-home-review={data!.mode}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8, transition: exitQuick }} transition={springSoft}
          className="glass w-full rounded-[calc(20px*var(--rk))] p-4"
          style={{ background: 'color-mix(in srgb, var(--bg-raised) 95%, transparent)', borderColor: 'rgb(var(--accent) / 0.35)',
            boxShadow: 'var(--shadow-panel), 0 0 26px -12px rgb(var(--accent) / 0.55)' }}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[13.5px] font-semibold tracking-tight">{title}</h2>
            <div className="flex items-center gap-0.5">
              <CloseX kind="minimize" onClick={() => fold(true)} label="Fold to a small button" />
              <CloseX onClick={() => hide('card')} label="Hide for today" />
            </div>
          </div>
          {data!.mode === 'before' ? <Before b={data!.before} /> : <Close lines={(data as { close: CloseLine[] }).close} />}
        </motion.section>
      ))}
    </AnimatePresence>
    </motion.div>
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

/** "Before you trade", in its own window — opened from the bell's morning reminder (it used to sit in the Dashboard header). */
export function BeforeSheet() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener('signature:before-open', on);
    return () => window.removeEventListener('signature:before-open', on);
  }, []);
  return (
    <Overlay open={open} onClose={() => setOpen(false)} className="relative w-[26rem] max-w-full max-h-[86vh] overflow-y-auto rounded-[calc(24px*var(--rk))] p-5"
      surface="color-mix(in srgb, var(--bg-raised) 97%, transparent)">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold tracking-tight">Before you trade</h2>
        <CloseX onClick={() => setOpen(false)} label="Close" />
      </div>
      {open && <HomeReview sheet />}
    </Overlay>
  );
}
