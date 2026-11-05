'use client';

import { startTransition, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { JOURNAL_CHANGED, takeStale } from '@/lib/freshness';

/*
  Screens drawn on the server (Dashboard, Stats, Calendar, Journal, Path,
  Prop, a trade's page…) re-render in place when the journal changes: a
  soft refresh in a transition, so what is on screen stays until the new
  version is ready and client state — scroll, open panels, a half-typed
  note — is kept. The Whiteboard reloads its own trades, and New trade is a
  form; neither is refreshed. A hidden window catches up when it is shown.
*/
const SELF_MANAGED = new Set(['/', '/new']);

export function LiveRefresh() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    let pending = false;
    const refresh = () => {
      if (document.hidden) { pending = true; return; }
      pending = false;
      takeStale();
      startTransition(() => router.refresh());
    };
    const onChange = () => { if (!SELF_MANAGED.has(path)) refresh(); };
    const onVisible = () => { if (pending && !document.hidden) refresh(); };
    window.addEventListener(JOURNAL_CHANGED, onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener(JOURNAL_CHANGED, onChange); document.removeEventListener('visibilitychange', onVisible); };
  }, [router, path]);
  return null;
}
