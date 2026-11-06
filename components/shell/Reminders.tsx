'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { press, springBouncy, springSnappy, stagger } from '@/lib/motion';
import { navigate } from '@/lib/nav';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import { openCheckIn } from './MorningCheckIn';
import { SETTINGS_TOGGLE } from './Shortcuts';
import { DEFAULT_SOUNDS, playSound, unlockAudioOnFirstTouch, type SoundId } from '@/lib/sounds';

/**
 * Reminders: a poll every minute (and on focus, and after a save) asks the
 * server what has become due; new ones pop up as a system notification and
 * land in the bell in the title bar. They inform — nothing here blocks or
 * suggests a trade.
 */

export interface BellItem {
  id: string; kind: string; title: string; body: string; route: string; urgent: boolean; silent: boolean;
  created_at: string; read_at: string | null; snoozed_until: string | null;
}

const COUNT = 'signature:reminders-count';
const POLL_MS = 60_000;
let lastCount = 0;

/** Where a reminder leads: a screen, the morning check-in, or a Settings category. */
export function openReminderRoute(route: string): void {
  if (route.startsWith('checkin:')) { openCheckIn(route === 'checkin:chart' ? 'chart' : 'morning'); return; }
  if (route.startsWith('settings:')) { window.dispatchEvent(new CustomEvent(SETTINGS_TOGGLE, { detail: { cat: route.slice(9), open: true } })); return; }
  // The prompts that used to open themselves on the Dashboard now open from here.
  if (route === 'redday' || route === 'weekend' || route === 'before') { window.dispatchEvent(new Event(`signature:${route}-open`)); return; }
  if (route.startsWith('/')) navigate(route);
}

const announce = (n: number) => { lastCount = n; window.dispatchEvent(new CustomEvent(COUNT, { detail: n })); };

/** A notification on the desktop: the app's own (Windows Action Center) or, in a browser, the web one. */
export interface SoundPrefs { on: boolean; volume: number; sounds: Record<string, SoundId | 'off'> }

/** Each kind its own cue (lib/sounds). True when one played — the system notification then stays silent. */
function chime(n: BellItem, sound?: SoundPrefs): boolean {
  if (!sound?.on || n.silent || sound.volume <= 0) return false;
  const id = sound.sounds[n.kind] ?? DEFAULT_SOUNDS[n.kind] ?? 'bell';
  if (id === 'off') return false;
  playSound(id, sound.volume / 100);
  return true;
}

async function pop(n: BellItem, sound?: SoundPrefs): Promise<void> {
  const played = chime(n, sound);
  const bridge = window.signature?.notify;
  if (bridge) { await bridge({ title: n.title, body: n.body, route: n.route, urgent: n.urgent, silent: played }); return; }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const note = new Notification(n.title, { body: n.body, tag: n.id, silent: played });
  note.onclick = () => { window.focus(); openReminderRoute(n.route); note.close(); };
}

/** Asks the browser for permission (the desktop app needs none). True when notifications can show. */
export async function enableDesktopNotifications(): Promise<boolean> {
  if (window.signature?.notify) return true;
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

export async function sendTestNotification(): Promise<void> {
  const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) });
  const { show, unread, sound } = await res.json() as { show: BellItem[]; unread: number; sound?: SoundPrefs };
  for (const n of show) await pop(n, sound);
  announce(unread);
}

/** Mounted once, in the layout: the poll. */
export function ReminderPoller() {
  useEffect(() => {
    unlockAudioOnFirstTouch();
    let busy = false;
    const tick = async () => {
      if (busy) return; busy = true;
      try {
        const res = await fetch('/api/reminders', { method: 'POST' });
        if (!res.ok) return;
        const { show, unread, sound } = await res.json() as { show: BellItem[]; unread: number; sound?: SoundPrefs };
        // Several at once (the app was closed): one sound, the first's — not a cascade.
        for (const [i, n] of show.entries()) await pop(n, i === 0 ? sound : undefined);
        announce(unread);
      } catch { /* the server is restarting; the next poll catches up */ } finally { busy = false; }
    };
    void tick();
    const timer = window.setInterval(tick, POLL_MS);
    const onFocus = () => void tick();
    window.addEventListener('focus', onFocus);
    window.addEventListener(JOURNAL_CHANGED, onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener(JOURNAL_CHANGED, onFocus); };
  }, []);
  return null;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
};

const patch = async (body: Record<string, unknown>) => {
  const res = await fetch('/api/reminders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => null) as { unread?: number } | null;
  if (typeof j?.unread === 'number') announce(j.unread);
};

/** The bell in the title bar: unread count, and the list. */
export function NotificationBell() {
  const [count, setCount] = useState(lastCount);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellItem[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener(COUNT, on);
    return () => window.removeEventListener(COUNT, on);
  }, []);

  const load = async () => {
    const res = await fetch('/api/reminders');
    const j = await res.json() as { items: BellItem[]; unread: number };
    setItems(j.items); announce(j.unread);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc, true); };
  }, [open]);

  const act = async (n: BellItem, action: 'read' | 'dismiss' | 'snooze' | 'done', minutes?: number) => {
    setItems((xs) => (action === 'read' ? xs?.map((x) => (x.id === n.id ? { ...x, read_at: x.read_at ?? 'now' } : x)) : xs?.filter((x) => x.id !== n.id)) ?? null);
    await patch({ id: n.id, action, minutes });
  };
  const go = (n: BellItem) => { void act(n, 'read'); setOpen(false); openReminderRoute(n.route); };

  return (
    <div ref={box} className="relative mr-2">
      <motion.button type="button" data-bell aria-label={count ? `Reminders, ${count} unread` : 'Reminders'} aria-expanded={open}
        onClick={() => { if (!open) void load(); setOpen(!open); }} whileTap={press} whileHover={{ y: -1 }} transition={springSnappy}
        title="Reminders"
        className="relative grid size-[26px] place-items-center rounded-full border outline-none"
        style={count
          ? { borderColor: 'rgb(var(--accent) / 0.6)', background: 'rgb(var(--accent) / 0.14)', color: 'rgb(var(--accent))', boxShadow: '0 0 14px -4px rgb(var(--accent) / 0.7)' }
          : { borderColor: open ? 'rgb(var(--accent) / 0.45)' : 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-faint)' }}>
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M10 2.8a5 5 0 0 0-5 5v2.6c0 .8-.3 1.6-.8 2.2L3.4 13.6c-.4.5 0 1.2.6 1.2h12c.6 0 1-.7.6-1.2l-.8-1c-.5-.6-.8-1.4-.8-2.2V7.8a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M8 16.6a2.1 2.1 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <AnimatePresence>
          {count > 0 && (
            <motion.span key="n" data-bell-count initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={springBouncy}
              className="absolute -right-1 -top-1 grid h-[15px] min-w-[15px] place-items-center">
              <span className="checkin-ping absolute inset-0 rounded-full" style={{ background: 'rgb(var(--accent))' }} />
              <span className="relative grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9.5px] font-semibold tabular-nums"
                style={{ background: 'rgb(var(--accent))', color: 'var(--bg)' }}>{count > 9 ? '9+' : count}</span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div data-bell-menu role="dialog" aria-label="Reminders"
            initial={{ opacity: 0, scale: 0.92, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }} transition={springBouncy}
            style={{ transformOrigin: 'top right', background: 'color-mix(in srgb, var(--bg-raised) 94%, transparent)' }}
            className="glass absolute right-0 top-[calc(100%+6px)] z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[calc(16px*var(--rk))] p-1.5">
            <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>Reminders</span>
              <div className="flex items-center gap-3 text-[11px]">
                {items?.some((x) => !x.read_at) && (
                  <button type="button" data-bell-readall onClick={() => { setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? 'now' })) ?? null); void patch({ action: 'readAll' }); }}
                    style={{ color: 'var(--text-dim)' }}>Mark all read</button>
                )}
                <button type="button" onClick={() => { setOpen(false); openReminderRoute('settings:notifications'); }} style={{ color: 'var(--text-dim)' }}>Settings</button>
              </div>
            </div>
            <div className="max-h-[min(26rem,70vh)] overflow-y-auto">
              {items === null ? null : items.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>Nothing waiting. Reminders show up here as the day goes.</p>
              ) : items.map((n, i) => {
                const snoozed = Boolean(n.snoozed_until);
                return (
                  <motion.div key={n.id} data-bell-item={n.id} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={stagger(Math.min(i, 8))}
                    className="group relative rounded-[calc(11px*var(--rk))] px-2.5 py-2 hover:bg-[var(--glass-fill-strong)]" style={{ opacity: snoozed ? 0.55 : 1 }}>
                    <button type="button" onClick={() => go(n)} className="block w-full text-left">
                      <div className="flex items-baseline gap-2">
                        {!n.read_at && <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: 'rgb(var(--accent))' }} />}
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>{n.title}</span>
                        <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
                          {snoozed ? `until ${new Date(n.snoozed_until!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ago(n.created_at)}
                        </span>
                      </div>
                      {n.body && <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: 'var(--text-dim)' }}>{n.body}</p>}
                    </button>
                    <div className="mt-1.5 flex gap-1.5 text-[10.5px]">
                      <button type="button" onClick={() => act(n, 'done')} data-bell-done
                        className="rounded-full px-2.5 py-0.5 font-semibold" style={{ background: 'rgb(var(--accent) / 0.14)', color: 'rgb(var(--accent))' }}>✓ Done</button>
                      {!snoozed && <>
                        <Mini onClick={() => act(n, 'snooze', 15)}>15 min</Mini>
                        <Mini onClick={() => act(n, 'snooze', 60)}>1 hour</Mini>
                      </>}
                      <Mini onClick={() => act(n, 'dismiss')} data-bell-dismiss>Dismiss</Mini>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Mini({ children, onClick, ...rest }: { children: React.ReactNode; onClick: () => void } & Record<`data-${string}`, boolean | string | undefined>) {
  return (
    <button type="button" onClick={onClick} {...rest} className="rounded-full border px-2 py-0.5"
      style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text-dim)' }}>{children}</button>
  );
}
