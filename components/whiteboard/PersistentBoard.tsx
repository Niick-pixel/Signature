'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePathname } from 'next/navigation';
import type { Trade } from '@/lib/types';
import { boardUnderneath } from '@/lib/nav';
import { BOARD_NOW, BOARD_SHOWN } from '@/lib/keys';
import { Whiteboard, type BoardStart } from './Whiteboard';
import { Library } from './Library';
import { usePreferences } from '@/components/shell/PreferencesProvider';

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
export function PersistentBoard({ start }: { start: BoardStart }) {
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
  /*
    The tab opens on the trade library; the free-form canvas is one switch
    away. Only the chosen one is built — the canvas, with its React Flow
    and every animated card, is not kept alive behind the library.
  */
  const { prefs, update } = usePreferences();
  const canvas = prefs.boardView === 'canvas';
  // Rows (the default: no charts drawn), Cards (small charts), or the Board (the canvas).
  const current = canvas ? 'board' : prefs.tradesLayout;
  const VIEWS = [
    { id: 'rows', label: 'Rows', title: 'One line per trade — no charts drawn; hover a row to see its chart', set: { boardView: 'library', tradesLayout: 'rows' } },
    { id: 'cards', label: 'Cards', title: 'Every trade with a small chart', set: { boardView: 'library', tradesLayout: 'cards' } },
    { id: 'board', label: 'Board', title: 'The free-form canvas: drag cards, notes, regions and lines', set: { boardView: 'canvas' } },
  ] as const;
  const viewSwitch = (
    <div role="group" aria-label="Trades view" data-board-view={current}
      className="glass inline-flex rounded-full p-0.5 text-[11.5px] font-medium">
      {VIEWS.map((v) => (
        <button key={v.id} type="button" aria-pressed={current === v.id} onClick={() => update(v.set)} data-board-view-option={v.id}
          title={v.title} className="rounded-full px-3 py-1"
          style={current === v.id ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' } : { color: 'var(--text-dim)' }}>
          {v.label}
        </button>
      ))}
    </div>
  );
  return (
    <div
      data-board-layer
      data-hidden={visible ? undefined : ''}
      aria-hidden={visible ? undefined : true}
      className="fixed inset-x-0 bottom-0 top-16 sm:top-11"
      style={visible ? undefined : { contentVisibility: 'hidden', pointerEvents: 'none' }}
    >
      {trades && (canvas
        ? <><Whiteboard trades={trades} start={start} /><div className="pointer-events-auto absolute left-4 top-3 z-30">{viewSwitch}</div></>
        : <Library trades={trades} boardSwitch={viewSwitch} />)}
    </div>
  );
}
