'use client';

import { navigate } from '@/lib/nav';

/** The board opens this trade's panel when it is next shown (components/whiteboard/Whiteboard). */
export const OPEN_TRADE_KEY = 'signature:open-trade';

export function OpenOnBoard({ id }: { id: string }) {
  return (
    <button type="button" data-open-on-board={id}
      onClick={() => { try { window.sessionStorage.setItem(OPEN_TRADE_KEY, id); } catch { /* fine */ } navigate('/'); }}
      className="text-[11px] font-medium underline-offset-2 hover:underline" style={{ color: 'rgb(var(--accent))' }}>
      Open on the board
    </button>
  );
}
