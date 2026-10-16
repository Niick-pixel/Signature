'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { SPRING_CSS, press, spring } from '@/lib/motion';
import { Wordmark } from './Wordmark';
import { CheckInChip } from './MorningCheckIn';
import { AccountPicker } from './AccountPicker';
import { UpdateChip } from './UpdateChip';
import { Suspense } from 'react';
import { navigate } from '@/lib/nav';

const TABS = [
  { href: '/', label: 'Whiteboard' },
  { href: '/stats', label: 'Stats' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/journal', label: 'Journal' },
  { href: '/path', label: 'Path' },
] as const;

/**
 * The window's own chrome. Electron hides the native title bar so the glass can
 * run to the edge, which means this strip provides the drag region — and has to
 * leave room for the platform's window buttons, which are drawn over it.
 */
/*
  Where the tab pill was on the previous screen. Every screen draws its own
  title bar, so the pill is a new element after each switch; it reads this to
  slide in from where the old one sat.
*/
let lastPill: { left: number; width: number } | null = null;

export function TitleBar() {
  const pathname = usePathname();
  const pill = useRef<HTMLSpanElement>(null);

  /*
    The pill slides between tabs on the compositor (FLIP: measure the old
    place, start there, animate transform to none). It used to be a Framer
    layoutId, stepped by JavaScript — and a switch is exactly when the main
    thread is busiest building the new screen, so it crawled and skipped,
    worst on the long Journal → Whiteboard slide.
  */
  useLayoutEffect(() => {
    const el = pill.current;
    if (!el) { lastPill = null; return; }
    const r = el.getBoundingClientRect();
    const from = lastPill;
    lastPill = { left: r.left, width: r.width };
    const still = document.documentElement.dataset.reduceMotion === 'true'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || still || (from.left === r.left && from.width === r.width) || r.width === 0) return;
    el.animate([
      { transform: `translateX(${from.left - r.left}px) scaleX(${from.width / r.width})` },
      { transform: 'none' },
    ], { duration: SPRING_CSS.duration, easing: SPRING_CSS.easing });
  }, [pathname]);
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    setPlatform(window.signature?.platform ?? null);
    // Menu items (Cmd+N and friends) navigate through the preload bridge.
    return window.signature?.onNavigate((route) => navigate(route));
  }, []);

  const isMac = platform === 'darwin';
  const isWindows = platform === 'win32';

  return (
    <header
      className="titlebar-drag relative flex h-11 shrink-0 items-center"
      style={{
        // macOS draws its traffic lights on the left; Windows and Linux draw
        // minimise/maximise/close on the right. Either way the buttons sit on
        // top of this strip, so the content has to get out of their way — the
        // theme control was landing underneath the minimise button.
        paddingLeft: isMac ? 88 : 16,
        paddingRight: isWindows ? 148 : 16,
      }}
    >
      <Wordmark />

      {/* Centred on the window, not on the space left over — so the tabs stay
          put regardless of what sits either side of them. */}
      <nav className="pointer-events-none absolute inset-x-0 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <motion.div key={tab.href} whileTap={press} transition={spring}>
                <Link
                  href={tab.href}
                  className="relative block rounded-full px-3.5 py-1.5 text-[12px] font-medium outline-none"
                  style={{ color: active ? 'var(--text)' : 'var(--text-faint)' }}
                >
                  {active && (
                    // Slides in from the previous tab — see the layout effect above.
                    <span
                      ref={pill}
                      className="absolute inset-0 rounded-full"
                      style={{ background: 'var(--glass-fill-strong)', border: '1px solid var(--glass-stroke)', transformOrigin: 'left center' }}
                    />
                  )}
                  <span className="relative">{tab.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </nav>

      {/* Right-hand side, clear of the window buttons (see the padding above). */}
      <div className="relative ml-auto flex items-center">
        {/* useSearchParams needs a Suspense boundary on statically rendered pages. */}
        <UpdateChip />
        <Suspense fallback={null}><AccountPicker /></Suspense>
        <CheckInChip />
      </div>
    </header>
  );
}
