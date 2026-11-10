'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePathname } from 'next/navigation';
import type { Trade } from '@/lib/types';
import { boardUnderneath } from '@/lib/nav';
import { BOARD_NOW, BOARD_SHOWN } from '@/lib/keys';
import { Library } from './Library';

/**
 * The whiteboard, kept alive across every screen.
 *
 * It used to be built from nothing each time you came back to it — React
 * Flow, every card, every chart image decoded again — which was the pause
 * and the stutter on every switch to it. Now it is mounted once, in the root
 * layout, and only hidden while another screen is up.
 *
 * Hidden with CSS content-visibility, not unmounted and not React's
 * <Activity>: the browser skips drawing it but keeps its rendering state, and
 * React never notices, so showing it again re-runs nothing — measured, an
 * Activity re-show re-ran every card's effects and cost as much JavaScript as
 * building the board. The board's own keys stand down while it is hidden
 * (lib/keys boardShown), and on every return it checks whether anything
 * changed meanwhile (BOARD_SHOWN).
 *
 * Its trades are fetched here, not rendered into every page: right away when
 * the board is the screen, otherwise once the browser is idle — so it is
 * ready by the time you switch to it, and no other screen waits for it.
 */
export function PersistentBoard() {
  const pathname = usePathname();
  // Visible on the board, and behind New trade when that was opened over it.
  /*
    Shown on the click (lib/nav sends BOARD_NOW), not when the router lands:
    the board is already built, so nothing makes it wait on the server. The
    flag goes once the path changes; a move that never lands lets go of it.
  */
  const [early, setEarly] = useState(false);
  useEffect(() => {
    const now = () => flushSync(() => setEarly(true));
    window.addEventListener(BOARD_NOW, now);
    return () => window.removeEventListener(BOARD_NOW, now);
  }, []);
  useEffect(() => {
    if (!early) return;
    const id = window.setTimeout(() => setEarly(false), 5000);
    return () => window.clearTimeout(id);
  }, [early]);
  // The path moved on: the router has caught up, the flag has done its job.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setEarly(false); }
  const visible = early || pathname === '/' || (pathname === '/new' && boardUnderneath());
  const [trades, setTrades] = useState<Trade[] | null>(null);
  useEffect(() => {
    if (trades) return;
    let cancelled = false;
    const load = () => { fetch('/api/trades').then((r) => (r.ok ? r.json() : null)).then((t) => { if (!cancelled && t) setTrades(t); }).catch(() => {}); };
    if (visible) { load(); return () => { cancelled = true; }; }
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 3000 });
      return () => { cancelled = true; window.cancelIdleCallback(id); };
    }
    const id = setTimeout(load, 1500);
    return () => { cancelled = true; clearTimeout(id); };
  }, [visible, trades]);
  useEffect(() => { if (visible && trades) window.dispatchEvent(new Event(BOARD_SHOWN)); }, [visible, trades]);
  return (
    <div
      data-board-layer
      data-hidden={visible ? undefined : ''}
      aria-hidden={visible ? undefined : true}
      className="fixed inset-x-0 bottom-0 top-16 sm:top-11"
      style={visible ? undefined : { contentVisibility: 'hidden', pointerEvents: 'none' }}
    >
      {/* The trade list. The free-form canvas is gone from here: the list is the whole tab. */}
      {trades && <Library trades={trades} />}
    </div>
  );
}
