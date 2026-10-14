'use client';

import { useEffect } from 'react';
import { pageShortcutAllowed } from '@/lib/keys';
import { navigate } from '@/lib/nav';

/**
 * Arrow-key paging for a screen whose pages are links: the calendar's months.
 * Renders nothing — it only listens.
 */
export function KeyNav({ prev, next, home }: { prev: string; next: string; home?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pageShortcutAllowed(e)) return;
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : e.key === 'Home' ? home : undefined;
      if (!to) return;
      e.preventDefault();
      navigate(to);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prev, next, home]);
  return null;
}
