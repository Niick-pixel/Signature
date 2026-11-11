'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { SPRING_CSS, press, spring } from '@/lib/motion';
import { Wordmark } from './Wordmark';
import { CheckInChip } from './MorningCheckIn';
import { AccountPicker } from './AccountPicker';
import { UpdateChip } from './UpdateChip';
import { Suspense } from 'react';
import { NotificationBell, openReminderRoute } from './Reminders';
import { usePreferences } from './PreferencesProvider';
import { setTitleSlot } from './TitleSlot';

export const TABS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/', label: 'Trades' },
  { href: '/stats', label: 'Stats' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/journal', label: 'Journal' },
  { href: '/path', label: 'Path' },
  { href: '/prop', label: 'Prop' },
  { href: '/study', label: 'Study' },
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
  const router = useRouter();
  const { prefs } = usePreferences();
  const pill = useRef<HTMLSpanElement>(null);
  const navRef = useRef<HTMLElement>(null);

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
    // On a narrow window the tabs scroll sideways: bring the current one into view first.
    const strip = navRef.current;
    if (strip && strip.scrollWidth > strip.clientWidth + 1) {
      const tab = el.parentElement!.getBoundingClientRect(); const box = strip.getBoundingClientRect();
      strip.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2;
    }
    const r = el.getBoundingClientRect();
    const from = lastPill;
    lastPill = { left: r.left, width: r.width };
    const still = document.documentElement.dataset.reduceMotion === 'true';
    if (!from || still || (from.left === r.left && from.width === r.width) || r.width === 0) return;
    el.animate([
      { transform: `translateX(${from.left - r.left}px) scaleX(${from.width / r.width})` },
      { transform: 'none' },
    ], { duration: SPRING_CSS.duration, easing: SPRING_CSS.easing });
  }, [pathname]);
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    setPlatform(window.signature?.platform ?? null);
    // For full-screen views drawn over the title strip: Windows paints its window buttons there (globals.css, data-wco-*).
    if (window.signature?.platform) document.documentElement.dataset.platform = window.signature.platform;
    // Menu items (Cmd+N and friends) and clicked notifications navigate through the preload bridge.
    return window.signature?.onNavigate((route) => openReminderRoute(route));
  }, []);

  const isMac = platform === 'darwin';
  const isWindows = platform === 'win32';

  return (
    <header
      className="titlebar-drag relative flex min-h-11 shrink-0 flex-wrap items-center xl:h-11 xl:flex-nowrap"
      style={{
        // macOS draws its traffic lights on the left; Windows and Linux draw
        // minimise/maximise/close on the right. Either way the buttons sit on
        // top of this strip, so the content has to get out of their way — the
        // theme control was landing underneath the minimise button.
        // With the side rail, the traffic lights sit over the rail, so only what is left of them needs clearing.
        // 24px: the pages' own gutter, so a title sits over the content's edge.
        paddingLeft: isMac ? 'max(24px, calc(88px - var(--rail-w)))' : 24,
        paddingRight: isWindows ? 148 : 16,
      }}
    >
      {/* With the side rail the mark and the tabs are on the rail (globals.css hides these two). */}
      <div data-title-wordmark><Wordmark /></div>

      {/* Wide windows: centred on the window, not on the space left over — so the
          tabs stay put regardless of what sits either side of them. Narrower: in
          the flow between the wordmark and the chips, scrolling sideways if they
          don't fit; on a phone, a full-width row of their own under the wordmark. */}
      <nav ref={navRef} data-tabs
        className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto pb-1.5 sm:order-none sm:mx-2 sm:w-auto sm:min-w-0 sm:flex-1 sm:pb-0 xl:pointer-events-none xl:absolute xl:inset-x-0 xl:mx-0 xl:flex xl:justify-center xl:overflow-visible [mask-image:linear-gradient(to_right,transparent,#000_var(--fade),#000_calc(100%-var(--fade)),transparent)] xl:[mask-image:none]"
        style={{ scrollbarWidth: 'none', ['--fade' as string]: '18px' }}>
        <div className="mx-auto flex w-max items-center gap-1 px-3 sm:px-0 xl:pointer-events-auto">
          {TABS.filter((tab) => (tab.href !== '/prop' || prefs.propTab) && (tab.href !== '/study' || prefs.studyTab)).map((tab) => {
            // A tab stays lit on its own sub-pages (/prop/<id>).
            const active = pathname === tab.href || (tab.href === '/prop' && pathname.startsWith('/prop/'));
            return (
              <motion.div key={tab.href} whileTap={press} transition={spring}>
                <Link
                  href={tab.href}
                  // Prefetched on hover, not on sight: after every save the page cache is
                  // cleared (lib/freshness, LiveRefresh), and eight tabs re-rendering on the
                  // server at once — Stats among them — would compete with the refresh you
                  // are waiting for. A hover is a few hundred ms ahead of the click.
                  prefetch={false}
                  onMouseEnter={() => router.prefetch(tab.href)}
                  onFocus={() => router.prefetch(tab.href)}
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

      {/* With the side rail: the page's own header (title, filters, actions) goes here — see TitleSlot. */}
      <div ref={setTitleSlot} data-title-slot className="mr-2 hidden min-w-0 flex-1 items-center" />

      {/* Right-hand side, clear of the window buttons (see the padding above). */}
      <div className="relative ml-auto flex items-center">
        {/* useSearchParams needs a Suspense boundary on statically rendered pages. */}
        <UpdateChip />
        <Suspense fallback={null}><AccountPicker /></Suspense>
        <NotificationBell />
        <CheckInChip />
        {/* New trade, here on every screen with the tabs on top (in the rail otherwise):
            last, so the chips that come and go never move it. */}
        <motion.div whileTap={press} whileHover={{ y: -1 }} transition={spring} className="ml-2" data-titlebar-new>
          <Link href="/new" prefetch={false} data-new-trade
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold outline-none"
            style={{ background: 'rgb(var(--accent))', color: 'var(--bg-raised)', boxShadow: '0 6px 18px -8px rgb(var(--accent) / 0.8)' }}>
            <span className="text-[14px] leading-none">+</span> New trade
          </Link>
        </motion.div>
      </div>
    </header>
  );
}
