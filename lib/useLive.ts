'use client';

import { useEffect, useRef, useState } from 'react';
import { JOURNAL_CHANGED, changedPaths } from './freshness';

/**
 * Reload when the journal changes anywhere in the app (lib/freshness), and
 * when the window comes back into focus. `ignore`: API path prefixes this
 * component writes itself and already shows — a flashcard session must not
 * reload under you because you just rated a card.
 */
export function useLive(load: () => void, opts: { ignore?: readonly string[]; focus?: boolean } = {}): void {
  const ref = useRef(load);
  useEffect(() => { ref.current = load; });
  const ignore = (opts.ignore ?? []).join('|');
  const focus = opts.focus ?? true;
  useEffect(() => {
    const skip = ignore ? ignore.split('|') : [];
    const onChange = (e: Event) => {
      const paths = changedPaths(e);
      if (paths.length && skip.length && paths.every((p) => skip.some((s) => p.startsWith(s)))) return;
      ref.current();
    };
    const onFocus = () => ref.current();
    window.addEventListener(JOURNAL_CHANGED, onChange);
    if (focus) window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener(JOURNAL_CHANGED, onChange); if (focus) window.removeEventListener('focus', onFocus); };
  }, [ignore, focus]);
}

/** A number that goes up each time the journal changes: put it in an effect's dependencies to re-run that effect. */
export function useLiveTick(opts: { ignore?: readonly string[]; focus?: boolean } = {}): number {
  const [tick, setTick] = useState(0);
  useLive(() => setTick((t) => t + 1), opts);
  return tick;
}
