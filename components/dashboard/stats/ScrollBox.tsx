'use client';

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

/**
 * A long widget's body: it scrolls inside its own box (thin overlay
 * scrollbar), with a soft fade at the edge that has more. The page never moves.
 * data-scrollbox lets the stack ask whether it is at its top or bottom.
 */
export const ScrollBox = forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(function ScrollBox({ children, className = '' }, outer) {
  const inner = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ top: true, bottom: true });
  const measure = useCallback(() => {
    const el = inner.current; if (!el) return;
    setEdge({ top: el.scrollTop <= 1, bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1 });
  }, []);
  useEffect(() => {
    measure();
    const el = inner.current; if (!el) return;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  const mask = `linear-gradient(to bottom, ${edge.top ? '#000' : 'transparent'} 0, #000 18px, #000 calc(100% - 18px), ${edge.bottom ? '#000' : 'transparent'} 100%)`;
  return (
    <div
      ref={(el) => { inner.current = el; if (typeof outer === 'function') outer(el); else if (outer) outer.current = el; }}
      onScroll={measure}
      data-scrollbox
      className={`signature-thin-scroll min-h-0 overflow-y-auto overscroll-contain ${className}`}
      style={{ maskImage: mask, WebkitMaskImage: mask }}>
      {children}
    </div>
  );
});
