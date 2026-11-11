'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePreferences } from './PreferencesProvider';

/**
 * The header merge. With the side rail on, the title bar has room: a page can
 * put its own header there (title, filters, actions) instead of a row of its
 * own, and its content gains that height. The title bar registers an empty
 * slot (TitleBar, data-title-slot); a page renders <InTitleBar> with a compact
 * header for the slot and its usual header for top tabs.
 *
 * Before hydration the stored choice is already on <html data-rail>, so the
 * inline header of a page that merges is hidden from the first paint
 * (globals.css, [data-inline-header]) and the page never jumps.
 */
let slot: HTMLElement | null = null;
const subs = new Set<() => void>();
export function setTitleSlot(el: HTMLElement | null): void {
  if (slot === el) return;
  slot = el;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Whether this page's header lives in the title bar right now. */
export function useMergedHeader(): boolean {
  const { prefs } = usePreferences();
  const el = useSyncExternalStore(subscribe, () => slot, () => null);
  return prefs.nav === 'side' && !!el;
}

/** `merged` in the title bar when the side rail is on; `inline` (marked, so it can be hidden before hydration) otherwise. */
export function InTitleBar({ merged, inline }: { merged: React.ReactNode; inline: React.ReactNode }) {
  const { prefs } = usePreferences();
  const el = useSyncExternalStore(subscribe, () => slot, () => null);
  if (prefs.nav === 'side' && el) return createPortal(merged, el);
  return <div data-inline-header className="contents">{inline}</div>;
}

/** The compact header every page puts in the title bar: its name, one quiet line of context, its actions on the right. */
export function MergedHeader({ title, sub, children, data }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; data?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 text-[12px]" data-merged-header={data}>
      <span className="shrink-0 text-[15px] font-semibold tracking-tight">{title}</span>
      {sub && <span className="min-w-0 truncate text-[11.5px]" style={{ color: 'var(--text-faint)' }}>{sub}</span>}
      {children && <div className="ml-auto flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}
