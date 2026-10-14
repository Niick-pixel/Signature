'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { EASE_BOUNCE, EASE_SOFT } from '@/lib/motion';

/**
 * The New trade window, opened over the screen you were on.
 *
 * It used to be a page of its own that drew a second, read-only copy of the
 * whole whiteboard behind the form and blurred it 18px — so opening it built
 * the board twice, and closing it rebuilt the real one from scratch. Now the
 * real screen stays mounted underneath (an intercepted route, app/@modal),
 * seen through a tint of the page's own ground: opening builds only the form,
 * and closing is instant because nothing underneath ever left.
 *
 * Opening and closing animate opacity and transform only, on the compositor.
 * Closing is played by lib/nav.ts before it navigates away.
 */
export function CaptureSheet({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.capture = '';
    const el = root.current;
    const still = html.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (el && !still) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_SOFT });
      el.querySelector<HTMLElement>('[data-sheet]')?.animate([
        { opacity: 0, transform: 'translateY(22px) scale(0.965)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 420, easing: EASE_BOUNCE });
    }
    return () => { delete html.dataset.capture; };
  }, []);

  return (
    <div
      ref={root}
      data-capture-root
      className="fixed inset-x-0 bottom-0 top-11 z-[55] overflow-y-auto"
      // A tint of the ground, not a backdrop blur: the board stays visibly
      // there behind the form, and nothing has to be re-blurred per frame.
      style={{ background: 'color-mix(in srgb, var(--bg) 74%, transparent)' }}
    >
      {/* Same column as the full page (app/new/page.tsx) — see the note there. */}
      <div className="mx-auto w-full max-w-[96rem] px-4 pb-20 pt-4 sm:px-6 2xl:max-w-[132rem] 2xl:pb-10">
        {children}
      </div>
    </div>
  );
}
