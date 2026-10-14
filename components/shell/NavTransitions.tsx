'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { arrived, navigate, registerNavigator } from '@/lib/nav';
import { freshPush, watchWrites } from '@/lib/freshness';

/**
 * Routes every internal link through lib/nav.ts, so moving between screens
 * animates however it was started — a tab, a calendar square, the New trade
 * button, a card's Edit link. Mounted once, in the root layout.
 */
export function NavTransitions() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { watchWrites(); }, []);
  useEffect(() => { registerNavigator((href) => freshPush(router, href)); }, [router]);
  // The new screen has rendered: let the transition play.
  useEffect(() => { arrived(); }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute('download') || a.dataset.noTransition !== undefined) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return;
      // Same screen (a filter, a month): let the link do its own thing.
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    // Capture, so this runs before next/link's own handler — which then sees
    // defaultPrevented and stands down.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
