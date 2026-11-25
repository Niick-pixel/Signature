'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Segmented } from '@/components/ui/Segmented';
import { press, spring, springSoft } from '@/lib/motion';
import { PLAN_ACCOUNTS } from '@/lib/replay';
import type { CockpitState } from '@/db/cockpit';
import { openInMain } from './openCockpit';

type PlanAccount = (typeof PLAN_ACCOUNTS)[number];
const LAST_ACCOUNT_KEY = 'signature.lastAccount';
const SEEN_KEY = 'signature.cockpit.seen';
const PAUSE_S = 60;
const LOSS = 'var(--outcome-loss)'; const WIN = 'var(--outcome-win)'; const AMBER = 'var(--amber)';
const TONE = { stop: LOSS, warn: AMBER, note: 'var(--text-faint)' } as const;
/** Your own clock: every time in the cockpit is the computer's local time. */
const LOCAL = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtIn = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`);
const read = <T,>(k: string, d: T): T => { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine */ } };

/**
 * The cockpit: one narrow column above the charts. The clock and what is next (the killzone, the
 * cutoff, the next release), today against your own rules, the nudges (lib/nudges — never a block,
 * never a call to trade), and the morning's plans, a tap from Step 1 in the main window.
 */
export function CockpitView() {
  const [s, setS] = useState<CockpitState | null>(null);
  const [clock, setClock] = useState('');
  const [account, setAccount] = useState<PlanAccount>('Demo');
  const [pinned, setPinned] = useState(true);
  const [pause, setPause] = useState<{ text: string; left: number } | null>(null);
  const desktop = typeof window !== 'undefined' && !!window.signature?.cockpit;
  useEffect(() => {
    const last = (() => { try { return window.localStorage.getItem(LAST_ACCOUNT_KEY); } catch { return null; } })();
    // After mount, not in the first render: the server has no saved account, and the two must match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last && (PLAN_ACCOUNTS as readonly string[]).includes(last)) setAccount(last as PlanAccount);
    void window.signature?.cockpit?.state().then((x) => setPinned(x.pinned));
    document.title = 'Cockpit · Signature';
  }, []);
  const load = useCallback(() => { void fetch('/api/cockpit').then((r) => r.json()).then(setS).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 15_000);
    const tick = window.setInterval(() => setClock(LOCAL.format(new Date())), 1000);
    // The clock starts at once, not a second late (the server renders none: its time is not yours).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClock(LOCAL.format(new Date()));
    return () => { window.clearInterval(id); window.clearInterval(tick); };
  }, [load]);
  // A stop or warn nudge seen for the first time today: a minute to breathe and read the rule (skippable).
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!s) return;
    const stored = read<{ day: string; keys: string[] }>(SEEN_KEY, { day: '', keys: [] });
    if (stored.day === s.day) for (const k of stored.keys) seen.current.add(k);
    const fresh = s.nudges.find((n) => n.level !== 'note' && !seen.current.has(n.key));
    if (fresh) {
      for (const n of s.nudges) seen.current.add(n.key);
      write(SEEN_KEY, { day: s.day, keys: [...seen.current] });
      // An answer to the nudges just read, once per new one — not derived state.
      setPause({ text: fresh.text, left: PAUSE_S });
    }
  }, [s]);
  useEffect(() => {
    if (!pause) return;
    // Each second, then gone at zero: both on the timer, never in the render.
    const t = window.setTimeout(() => setPause((p) => (p && p.left > 1 ? { ...p, left: p.left - 1 } : null)), 1000);
    return () => window.clearTimeout(t);
  }, [pause]);
  const pick = (k: 'a' | 'b') => {
    write(LAST_ACCOUNT_KEY, account);
    try { window.localStorage.setItem(LAST_ACCOUNT_KEY, account); } catch { /* fine */ }
    openInMain(`/new?plan=${k}&from=prep&account=${encodeURIComponent(account)}`);
  };
  const t = s?.today;
  const lossesTone = t && t.stopAfter > 0 && t.losses >= t.stopAfter ? LOSS : t && t.stopAfter > 1 && t.losses === t.stopAfter - 1 ? AMBER : null;
  const tradesTone = t && t.maxTrades && t.trades >= t.maxTrades ? AMBER : null;
  return (
    // Fixed over the whole window: the app's page padding (the rail's room) does not apply here.
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden text-[12px]" style={{ background: 'var(--bg)', color: 'var(--text)' }} data-cockpit>
      {/* The bar: drag the window by it; pin above the charts, close. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--glass-stroke)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-faint)' }}>Cockpit · your time</div>
          <div className="text-[22px] font-semibold leading-none tabular-nums" data-cockpit-clock>{clock}</div>
        </div>
        <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {desktop && (
            <button type="button" onClick={() => void window.signature?.cockpit?.pin(!pinned).then(setPinned)} title={pinned ? 'Kept above other windows — click to let it go behind' : 'Keep above other windows'}
              className="grid size-7 place-items-center rounded-full border text-[12px]" style={{ borderColor: pinned ? 'rgb(var(--accent) / 0.5)' : 'var(--glass-stroke)', color: pinned ? 'rgb(var(--accent))' : 'var(--text-faint)' }} data-cockpit-pin>⇡</button>
          )}
          <button type="button" onClick={() => (desktop ? void window.signature?.cockpit?.close() : window.close())} title="Close the cockpit"
            className="grid size-7 place-items-center rounded-full border text-[13px]" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>✕</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* What is next. */}
        <div className="space-y-1" data-cockpit-countdowns>
          {(s?.countdowns ?? []).map((c) => (
            <div key={c.key} className="flex items-baseline justify-between gap-2 rounded-[10px] px-2.5 py-1.5" style={{ background: 'var(--glass-fill)' }}>
              <span className="min-w-0 truncate" style={{ color: 'var(--text-dim)' }}>{c.label}</span>
              <span className="shrink-0 font-semibold tabular-nums" style={{ color: c.key === 'news' && c.inMin <= 10 ? `rgb(${AMBER})` : 'var(--text)' }}>in {fmtIn(c.inMin)}</span>
            </div>
          ))}
          {s && s.countdowns.length === 0 && <p className="px-1" style={{ color: 'var(--text-faint)' }}>The session is over for today.</p>}
        </div>

        {/* Today against your own rules. */}
        <div className="grid grid-cols-3 gap-1.5" data-cockpit-today>
          {[
            { k: 'trades', label: 'Trades', value: t ? `${t.trades}${t.maxTrades ? `/${t.maxTrades}` : ''}` : '—', tone: tradesTone, title: 'Taken today on real accounts, against the trades you planned this morning' },
            { k: 'losses', label: 'Losses', value: t ? `${t.losses}/${t.stopAfter}` : '—', tone: lossesTone, title: 'Losses today against your stop after N losses' },
            { k: 'r', label: 'R today', value: t ? `${t.r > 0 ? '+' : t.r < 0 ? '−' : ''}${Math.abs(t.r).toFixed(2)}` : '—', tone: t && t.r < 0 ? LOSS : t && t.r > 0 ? WIN : null, title: 'Net R today, real accounts' },
          ].map((x) => (
            <div key={x.k} title={x.title} className="rounded-[12px] border px-2 py-1.5" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }} data-cockpit-stat={x.k}>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{x.label}</div>
              <div className="text-[17px] font-semibold tabular-nums" style={{ color: x.tone ? `rgb(${x.tone})` : 'var(--text)' }}>{x.value}</div>
            </div>
          ))}
        </div>

        {/* The nudges: a rule you wrote, or your own day — never a block. */}
        <AnimatePresence initial={false}>
          {(s?.nudges ?? []).map((n) => (
            <motion.p key={n.key} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={spring}
              className="rounded-[10px] border px-2.5 py-1.5 leading-snug" data-nudge={n.kind} data-level={n.level}
              style={{ borderColor: `rgb(${TONE[n.level]} / 0.45)`, background: `rgb(${TONE[n.level]} / 0.07)`, color: n.level === 'note' ? 'var(--text-dim)' : 'var(--text)' }}>
              {n.text}
            </motion.p>
          ))}
        </AnimatePresence>

        {/* The morning's plans, a tap from Step 1 in the main window. */}
        <div data-cockpit-plans>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Today&rsquo;s plan</span>
          </div>
          {s?.plans ? (
            <>
              <div className="mb-2"><Segmented value={account} onChange={setAccount} options={PLAN_ACCOUNTS} compact /></div>
              <div className="space-y-1.5">
                {s.plans.map((p) => (
                  <motion.button key={p.k} type="button" onClick={() => pick(p.k)} whileTap={press} whileHover={{ y: -1 }} transition={springSoft} data-cockpit-plan={p.k}
                    className="block w-full rounded-[12px] border px-2.5 py-2 text-left" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}
                    title={`New trade on Scenario ${p.k.toUpperCase()}, on ${account}, in the main window`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">Scenario {p.k.toUpperCase()} <span className="text-[10.5px] font-medium" style={{ color: 'rgb(var(--accent))' }}>trade on {account} ▸</span></span>
                      <span className="text-[11px] font-medium" style={{ color: p.dir === 'Long' ? `rgb(${WIN})` : p.dir === 'Short' ? `rgb(${LOSS})` : 'var(--text-faint)' }}>{p.dir ?? '—'}</span>
                    </div>
                    <div className="mt-0.5 leading-snug" style={{ color: 'var(--text-dim)' }}>{p.line ?? 'Not written'}</div>
                    {p.ceiling && <div className="mt-0.5 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{p.ceiling}</div>}
                  </motion.button>
                ))}
              </div>
              {s.scenarioC && <p className="mt-1.5 rounded-[10px] border border-dashed px-2.5 py-1.5 leading-snug" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}><b style={{ color: 'var(--text)' }}>C</b> — {s.scenarioC}</p>}
            </>
          ) : (
            <button type="button" onClick={() => openInMain('checkin:chart')} className="w-full rounded-[12px] border border-dashed px-3 py-3 text-center" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} data-cockpit-no-plan>
              No plan written for today — write it in the chart prep ▸
            </button>
          )}
        </div>
      </div>

      {/* A minute to breathe, when a stop or warning first shows. Skippable; nothing waits on it. */}
      <AnimatePresence>
        {pause && (
          <motion.div key="pause" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 px-6 text-center" data-cockpit-pause
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ background: 'var(--bg-raised)' }}>
            <div className="relative grid size-28 place-items-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90"><circle cx="50" cy="50" r="44" fill="none" stroke="var(--glass-stroke)" strokeWidth="5" />
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(var(--accent))" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 44}
                  strokeDashoffset={2 * Math.PI * 44 * (1 - pause.left / PAUSE_S)} style={{ transition: 'stroke-dashoffset 1s linear' }} /></svg>
              <motion.span className="size-14 rounded-full" style={{ background: 'rgb(var(--accent) / 0.18)' }} animate={{ scale: [0.8, 1.15, 0.8] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
              <span className="absolute text-[20px] font-semibold tabular-nums">{pause.left}</span>
            </div>
            <p className="text-[12.5px] leading-snug">{pause.text}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Breathe in for four, out for four. Read your rule once more.</p>
            <button type="button" onClick={() => setPause(null)} className="rounded-full border px-4 py-1.5 text-[12px] font-medium" style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }} data-cockpit-skip>Skip</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
