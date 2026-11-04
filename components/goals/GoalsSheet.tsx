'use client';

import { useEffect, useState } from 'react';
import { Overlay } from '@/components/ui/Overlay';
import { CloseX } from '@/components/review/CloseX';
import { GoalsView } from './GoalsView';

const OPEN = 'signature:goals-open';

/** Opens Goals as a floating window over the screen you are on (G, the Path, the Today panel). */
export function openGoals(): void {
  window.dispatchEvent(new Event(OPEN));
}

/** Mounted once, in the layout. */
export function GoalsSheet() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN, on);
    return () => window.removeEventListener(OPEN, on);
  }, []);
  return (
    <Overlay open={open} onClose={() => setOpen(false)} className="relative w-[60rem] max-w-full max-h-[88vh] overflow-y-auto rounded-[calc(26px*var(--rk))] p-7"
      surface="color-mix(in srgb, var(--bg-raised) 96%, transparent)">
      <div className="absolute right-4 top-4 z-10"><CloseX onClick={() => setOpen(false)} label="Close goals" /></div>
      <div data-goals-sheet className="pt-5"><GoalsView /></div>
    </Overlay>
  );
}
