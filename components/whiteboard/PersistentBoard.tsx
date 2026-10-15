'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { Trade } from '@/lib/types';
import { boardUnderneath } from '@/lib/nav';
import { BOARD_SHOWN } from '@/lib/keys';
import { Whiteboard, type BoardStart } from './Whiteboard';

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
 */
export function PersistentBoard({ trades, start }: { trades: Trade[]; start: BoardStart }) {
  const pathname = usePathname();
  // Visible on the board, and behind New trade when that was opened over it.
  const visible = pathname === '/' || (pathname === '/new' && boardUnderneath());
  useEffect(() => { if (visible) window.dispatchEvent(new Event(BOARD_SHOWN)); }, [visible]);
  return (
    <div
      data-board-layer
      data-hidden={visible ? undefined : ''}
      aria-hidden={visible ? undefined : true}
      className="fixed inset-x-0 bottom-0 top-11"
      style={visible ? undefined : { contentVisibility: 'hidden', pointerEvents: 'none' }}
    >
      <Whiteboard trades={trades} start={start} />
    </div>
  );
}
