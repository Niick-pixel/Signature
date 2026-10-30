'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders its children only once the surrounding <details> is opened, and
 * keeps them after. A folded section costs nothing on load — the eval
 * simulator used to run 20,000 futures for a section nobody had opened.
 */
export function WhenOpen({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current?.closest('details');
    if (!d) { setOpen(true); return; }
    if (d.open) { setOpen(true); return; }
    const on = () => { if (d.open) { setOpen(true); d.removeEventListener('toggle', on); } };
    d.addEventListener('toggle', on);
    return () => d.removeEventListener('toggle', on);
  }, []);
  return <><span ref={ref} hidden />{open ? children : null}</>;
}
